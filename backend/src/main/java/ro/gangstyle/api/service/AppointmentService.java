package ro.gangstyle.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.AppointmentRequestDto;
import ro.gangstyle.api.dto.AppointmentResponseDto;
import ro.gangstyle.api.dto.AppointmentUpdateDto;
import ro.gangstyle.api.exception.AppointmentConflictException;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.model.Appointment;
import ro.gangstyle.api.model.Barber;
import ro.gangstyle.api.model.ServicePackage;
import ro.gangstyle.api.model.User;
import ro.gangstyle.api.repository.AppointmentRepository;
import ro.gangstyle.api.repository.BarberRepository;
import ro.gangstyle.api.repository.ServicePackageRepository;
import ro.gangstyle.api.repository.UserRepository;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class AppointmentService {

    private static final Logger log = LoggerFactory.getLogger(AppointmentService.class);

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private static final Locale RO_LOCALE = Locale.forLanguageTag("ro-RO");
    private static final DateTimeFormatter RO_DATE_LABEL_FORMATTER =
            DateTimeFormatter.ofPattern("EEEE, d MMMM", RO_LOCALE);

    // Salon business constraints (14-day rolling booking window for client reservations)
    private static final int MAX_BOOKING_HORIZON_DAYS = 14;
    private static final int MAX_ALLOWED_NO_SHOWS = 2;
    private static final long CANCELLATION_CUTOFF_HOURS = 3;
    private static final LocalTime SALON_OPEN_TIME = LocalTime.of(9, 0);
    private static final LocalTime SALON_CLOSE_TIME = LocalTime.of(21, 0);
    private static final String SALON_CONTACT_PHONE = "0770426308";

    private final AppointmentRepository appointmentRepository;
    private final BarberRepository barberRepository;
    private final ServicePackageRepository servicePackageRepository;
    private final UserRepository userRepository;
    private final AvailabilityService availabilityService;
    private final EmailService emailService;

    public AppointmentService(
            AppointmentRepository appointmentRepository,
            BarberRepository barberRepository,
            ServicePackageRepository servicePackageRepository,
            UserRepository userRepository,
            AvailabilityService availabilityService,
            EmailService emailService) {
        this.appointmentRepository = appointmentRepository;
        this.barberRepository = barberRepository;
        this.servicePackageRepository = servicePackageRepository;
        this.userRepository = userRepository;
        this.availabilityService = availabilityService;
        this.emailService = emailService;
    }

    // Creates and persists a new appointment with validation checks
    public AppointmentResponseDto createAppointment(AppointmentRequestDto request, String authenticatedEmail) {
        // Step 1: Clean and normalize barber slug
        String barberSlug = request.getBarberSlug().trim().toLowerCase();

        // Step 2: Fetch barber from database or throw 404 if not found
        Barber barber = barberRepository.findBySlug(barberSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit: " + barberSlug));

        // Step 3: Resolve service details from catalog
        Optional<ServicePackage> serviceOpt = servicePackageRepository.findById(request.getServiceId().trim());
        String serviceName;
        int durationMinutes;
        int slotMinutes;
        double priceRon;

        if (serviceOpt.isPresent()) {
            // Read duration and pricing from database
            ServicePackage service = serviceOpt.get();
            serviceName = service.getName();
            durationMinutes = service.getDurationMinutes();
            slotMinutes = service.getSlotMinutes() > 0 ? service.getSlotMinutes() : durationMinutes;
            priceRon = service.getPriceRon();
        } else if (request.getServiceName() != null && request.getDurationMinutes() != null && request.getPriceRon() != null) {
            // Fallback: use values provided in request payload
            serviceName = request.getServiceName().trim();
            durationMinutes = request.getDurationMinutes();
            slotMinutes = durationMinutes;
            priceRon = request.getPriceRon();
        } else {
            throw new ResourceNotFoundException("Pachetul de servicii selectat nu există.");
        }

        // Validate reasonable service duration (15 to 240 minutes)
        if (durationMinutes <= 0 || durationMinutes > 240) {
            throw new IllegalArgumentException("Durata serviciului trebuie să fie între 15 și 240 de minute.");
        }

        // Step 4: Parse appointment date (YYYY-MM-DD) and start time (HH:mm)
        LocalDate appointmentDate;
        LocalTime startLocalTime;
        try {
            appointmentDate = LocalDate.parse(request.getDateIso().trim());
            startLocalTime = LocalTime.parse(request.getStartTime().trim(), TIME_FORMATTER);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Formatul datei (YYYY-MM-DD) sau al orei (HH:mm) este invalid.");
        }

        // Step 5: Compute start and end timestamps
        LocalDateTime startDateTime = LocalDateTime.of(appointmentDate, startLocalTime);
        LocalDateTime endDateTime = startDateTime.plusMinutes(durationMinutes);
        LocalTime endLocalTime = endDateTime.toLocalTime();

        // Convert times to minutes from midnight (00:00 = 0) for fast interval math
        int startMinutes = startLocalTime.getHour() * 60 + startLocalTime.getMinute();
        int endMinutes = startMinutes + durationMinutes;

        // Check if booking was initiated online by client
        String source = normalizeSource(request.getSource());
        boolean isOnlineClientBooking = "ONLINE".equalsIgnoreCase(source);

        // Step 6: Validate client constraints for online bookings
        if (isOnlineClientBooking) {
            // Verify date is in future, within 14-day limit, and salon is open
            validateTemporalConstraints(appointmentDate, startLocalTime, endLocalTime, startDateTime);
            // Block clients with 2+ unexcused missed visits
            validateClientNoShowHistory(request.getClientPhone());
        }

        // Step 7: Prevent double-booking (ensure slot does not overlap another booking)
        validateNoTimeSlotOverlap(barberSlug, appointmentDate.toString(), startMinutes, endMinutes, barber.getName());

        // Step 8: Prepare date label in Romanian (e.g. "Luni, 25 Noiembrie")
        String dateLabel = (request.getDateLabel() != null && !request.getDateLabel().isBlank())
                ? request.getDateLabel().trim()
                : formatRomanianDateLabel(appointmentDate);

        // Step 9: Bind appointment to email (request email or logged-in user email)
        String clientEmail = (request.getClientEmail() != null && !request.getClientEmail().isBlank())
                ? request.getClientEmail().trim().toLowerCase()
                : (authenticatedEmail != null ? authenticatedEmail.trim().toLowerCase() : "");

        // Step 10: Instantiate the appointment entity
        Appointment appointment = new Appointment(
                barber.getSlug(),
                barber.getName(),
                barber.getPhotoUrl(),
                request.getServiceId().trim(),
                serviceName,
                durationMinutes,
                slotMinutes,
                priceRon,
                appointmentDate.toString(),
                dateLabel,
                startLocalTime.format(TIME_FORMATTER),
                endLocalTime.format(TIME_FORMATTER),
                startMinutes,
                endMinutes,
                request.getClientFirstName().trim(),
                request.getClientLastName().trim(),
                clientEmail,
                request.getClientPhone().trim(),
                request.getNotes() != null ? request.getNotes().trim() : "",
                source,
                "CONFIRMED",
                Instant.now()
        );
        appointment.setStartDateTime(startDateTime);
        appointment.setEndDateTime(endDateTime);
        if (request.getReferralSource() != null && !request.getReferralSource().isBlank()) {
            appointment.setReferralSource(request.getReferralSource().trim());
        }
        if (request.getReferralCode() != null && !request.getReferralCode().isBlank()) {
            appointment.setReferralCode(request.getReferralCode().trim());
        }

        // Step 11: Save record to MongoDB database
        Appointment saved = appointmentRepository.save(appointment);
        log.info("Created appointment [{}] for barber '{}' on {} ({}-{})",
                saved.getId(), barberSlug, saved.getDateIso(), saved.getStartTime(), saved.getEndTime());

        // Step 12: Send confirmation email in background (does not block client response)
        emailService.sendAppointmentConfirmationAsync(saved);

        // Step 13: Map saved entity to DTO and return response
        return AppointmentResponseDto.fromEntity(saved);
    }

    /**
     * Retrieves all appointments belonging to the currently authenticated client,
     * matching either their account email or their normalized phone number.
     */
    public List<AppointmentResponseDto> getMyAppointments(String authenticatedEmail, String phoneParam) {
        String targetEmail = authenticatedEmail != null ? authenticatedEmail.trim().toLowerCase() : "";

        // Look up the user's registered phone number so appointments booked by phone also appear in their portal
        String normalizedUserPhone = normalizePhone(phoneParam);
        if (normalizedUserPhone.isEmpty() && !targetEmail.isEmpty()) {
            Optional<User> userOpt = userRepository.findByEmail(targetEmail);
            if (userOpt.isPresent() && userOpt.get().getPhone() != null) {
                normalizedUserPhone = normalizePhone(userOpt.get().getPhone());
            }
        }

        final String finalEmail = targetEmail;
        final String finalPhone = normalizedUserPhone;

        return appointmentRepository.findAll().stream()
                .filter(app -> {
                    boolean emailMatch = !finalEmail.isEmpty()
                            && app.getClientEmail() != null
                            && finalEmail.equalsIgnoreCase(app.getClientEmail().trim());
                    boolean phoneMatch = !finalPhone.isEmpty()
                            && app.getClientPhone() != null
                            && finalPhone.equals(normalizePhone(app.getClientPhone()));
                    return emailMatch || phoneMatch;
                })
                .sorted(Comparator
                        .comparing(Appointment::getDateIso, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Appointment::getStartMinutes, Comparator.reverseOrder()))
                .map(AppointmentResponseDto::fromEntity)
                .toList();
    }

    /**
     * Lists appointments filtered optionally by barberSlug and/or dateIso,
     * ordered chronologically by date and start time.
     */
    public List<AppointmentResponseDto> getAppointments(String barberSlug, String dateIso) {
        List<Appointment> results;

        boolean hasBarber = barberSlug != null && !barberSlug.isBlank();
        boolean hasDate = dateIso != null && !dateIso.isBlank();

        if (hasBarber && hasDate) {
            results = appointmentRepository.findByBarberSlugAndDateIso(
                    barberSlug.trim().toLowerCase(),
                    dateIso.trim()
            );
        } else if (hasBarber) {
            results = appointmentRepository.findByBarberSlugOrderByDateIsoAscStartTimeAsc(
                    barberSlug.trim().toLowerCase()
            );
        } else if (hasDate) {
            results = appointmentRepository.findByDateIsoOrderByStartTimeAsc(dateIso.trim());
        } else {
            results = appointmentRepository.findAll();
        }

        return results.stream()
                .sorted(Comparator
                        .comparing(Appointment::getDateIso, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparingInt(Appointment::getStartMinutes))
                .map(AppointmentResponseDto::fromEntity)
                .toList();
    }

    /**
     * Retrieves a single appointment by its ID while enforcing Anti-IDOR ownership verification.
     * Regular clients can only inspect their own appointments; barbers and administrators can inspect any appointment.
     */
    public AppointmentResponseDto getAppointmentById(String id, String requesterEmail, boolean isStaff) {
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea cu ID-ul specificat nu a fost găsită."));

        // Anti-IDOR check: prevent a client from reading another client's appointment details by guessing the ID
        verifyAppointmentOwnership(appointment, requesterEmail, isStaff, "vizualiza");

        return AppointmentResponseDto.fromEntity(appointment);
    }

    /**
     * Full update (PUT) of an existing appointment: supports rescheduling (date, startTime),
     * changing the service package (which dynamically recalculates endTime and duration),
     * updating client contact details/notes, and optional status changes by staff.
     *
     * Security & Business Rules enforced:
     * 1. Anti-IDOR ownership check: regular clients can only modify appointments that belong to them (HTTP 403 otherwise).
     * 2. 3-hour cutoff rule: regular clients cannot modify an appointment less than 3 hours before it starts.
     * 3. 14-day (2-week) booking horizon & working hours validation for client rescheduling.
     * 4. Self-excluding anti-overlap check: ensures the new time slot does not collide with any other active appointment.
     */
    public AppointmentResponseDto updateAppointment(
            String id,
            AppointmentUpdateDto request,
            String requesterEmail,
            boolean isStaff) {

        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea nu a fost găsită."));

        // 1. Anti-IDOR Ownership Verification
        verifyAppointmentOwnership(appointment, requesterEmail, isStaff, "modifica");

        // 2. If invoked by a regular client, enforce lifecycle state and the 3-hour cutoff notice rule
        if (!isStaff) {
            if ("CANCELLED".equalsIgnoreCase(appointment.getStatus())) {
                throw new IllegalArgumentException("Nu poți modifica o programare care a fost deja anulată.");
            }
            if ("COMPLETED".equalsIgnoreCase(appointment.getStatus()) || "NO_SHOW".equalsIgnoreCase(appointment.getStatus())) {
                throw new IllegalArgumentException("Nu poți modifica o programare deja încheiată.");
            }
            enforceThreeHourCutoff(appointment, "modificări");
        }

        // 3. Resolve barber (keep current barber unless a new barberSlug is explicitly provided)
        String targetBarberSlug = (request.getBarberSlug() != null && !request.getBarberSlug().isBlank())
                ? request.getBarberSlug().trim().toLowerCase()
                : appointment.getBarberSlug();

        Barber barber = barberRepository.findBySlug(targetBarberSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit: " + targetBarberSlug));

        // 4. Resolve service package and duration (recalculate duration if serviceId or durationMinutes changed)
        String serviceId = (request.getServiceId() != null && !request.getServiceId().isBlank())
                ? request.getServiceId().trim()
                : appointment.getServiceId();
        String serviceName = appointment.getServiceName();
        int durationMinutes = appointment.getDurationMinutes() > 0 ? appointment.getDurationMinutes() : 30;
        int slotMinutes = appointment.getSlotMinutes() > 0 ? appointment.getSlotMinutes() : durationMinutes;
        double priceRon = appointment.getPriceRon();

        if (request.getServiceId() != null && !request.getServiceId().isBlank()) {
            Optional<ServicePackage> serviceOpt = servicePackageRepository.findById(serviceId);
            if (serviceOpt.isPresent()) {
                ServicePackage srv = serviceOpt.get();
                serviceName = srv.getName();
                durationMinutes = srv.getDurationMinutes();
                slotMinutes = srv.getSlotMinutes() > 0 ? srv.getSlotMinutes() : durationMinutes;
                priceRon = srv.getPriceRon();
            } else if (request.getServiceName() != null && request.getDurationMinutes() != null && request.getPriceRon() != null) {
                serviceName = request.getServiceName().trim();
                durationMinutes = request.getDurationMinutes();
                slotMinutes = durationMinutes;
                priceRon = request.getPriceRon();
            }
        } else {
            if (request.getServiceName() != null && !request.getServiceName().isBlank()) {
                serviceName = request.getServiceName().trim();
            }
            if (request.getDurationMinutes() != null && request.getDurationMinutes() > 0) {
                durationMinutes = request.getDurationMinutes();
                slotMinutes = durationMinutes;
            }
            if (request.getPriceRon() != null && request.getPriceRon() >= 0) {
                priceRon = request.getPriceRon();
            }
        }

        if (durationMinutes <= 0 || durationMinutes > 240) {
            throw new IllegalArgumentException("Durata serviciului trebuie să fie între 15 și 240 de minute.");
        }

        // 5. Resolve target date and start time
        String targetDateIso = (request.getDateIso() != null && !request.getDateIso().isBlank())
                ? request.getDateIso().trim()
                : appointment.getDateIso();
        String targetStartTimeStr = (request.getStartTime() != null && !request.getStartTime().isBlank())
                ? request.getStartTime().trim()
                : appointment.getStartTime();

        LocalDate appointmentDate;
        LocalTime startLocalTime;
        try {
            appointmentDate = LocalDate.parse(targetDateIso);
            startLocalTime = LocalTime.parse(targetStartTimeStr, TIME_FORMATTER);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Formatul datei (YYYY-MM-DD) sau al orei (HH:mm) este invalid.");
        }

        LocalDateTime startDateTime = LocalDateTime.of(appointmentDate, startLocalTime);
        LocalDateTime endDateTime = startDateTime.plusMinutes(durationMinutes);
        LocalTime endLocalTime = endDateTime.toLocalTime();

        int newStartMinutes = startLocalTime.getHour() * 60 + startLocalTime.getMinute();
        int newEndMinutes = newStartMinutes + durationMinutes;

        // 6. If a regular client is rescheduling to a new date or time, validate temporal constraints (14-day horizon, salon hours)
        boolean timeOrDateChanged = !targetDateIso.equals(appointment.getDateIso())
                || !targetStartTimeStr.equals(appointment.getStartTime())
                || !targetBarberSlug.equalsIgnoreCase(appointment.getBarberSlug());

        if (!isStaff && timeOrDateChanged) {
            validateTemporalConstraints(appointmentDate, startLocalTime, endLocalTime, startDateTime);
        }

        // 7. Self-excluding anti-overlap validation:
        // Pass appointment.getId() so the existing slot of this appointment does not conflict with itself
        availabilityService.assertSlotAvailable(
                barber.getSlug(),
                appointmentDate.toString(),
                newStartMinutes,
                newEndMinutes,
                barber.getName(),
                appointment.getId()
        );

        // 8. Apply updated fields to the appointment entity
        appointment.setBarberSlug(barber.getSlug());
        appointment.setBarberName(barber.getName());
        appointment.setBarberPhotoUrl(barber.getPhotoUrl());
        appointment.setServiceId(serviceId);
        appointment.setServiceName(serviceName);
        appointment.setDurationMinutes(durationMinutes);
        appointment.setSlotMinutes(slotMinutes);
        appointment.setPriceRon(priceRon);
        appointment.setDateIso(appointmentDate.toString());

        String dateLabel = (request.getDateLabel() != null && !request.getDateLabel().isBlank() && !timeOrDateChanged)
                ? request.getDateLabel().trim()
                : formatRomanianDateLabel(appointmentDate);
        appointment.setDateLabel(dateLabel);

        appointment.setStartTime(startLocalTime.format(TIME_FORMATTER));
        appointment.setEndTime(endLocalTime.format(TIME_FORMATTER));
        appointment.setStartMinutes(newStartMinutes);
        appointment.setEndMinutes(newEndMinutes);
        appointment.setStartDateTime(startDateTime);
        appointment.setEndDateTime(endDateTime);

        if (request.getClientFirstName() != null && !request.getClientFirstName().isBlank()) {
            appointment.setClientFirstName(request.getClientFirstName().trim());
        }
        if (request.getClientLastName() != null && !request.getClientLastName().isBlank()) {
            appointment.setClientLastName(request.getClientLastName().trim());
        }
        if (request.getClientPhone() != null && !request.getClientPhone().isBlank()) {
            appointment.setClientPhone(request.getClientPhone().trim());
        }
        if (request.getNotes() != null) {
            appointment.setNotes(request.getNotes().trim());
        }

        // Only staff members (BARBER / ADMIN) can directly override lifecycle status via PUT
        if (isStaff && request.getStatus() != null && !request.getStatus().isBlank()) {
            appointment.setStatus(normalizeStatus(request.getStatus()));
        }

        Appointment updated = appointmentRepository.save(appointment);
        log.info("Updated appointment [{}] by {} (staff={}) -> {} {}-{}",
                updated.getId(), requesterEmail, isStaff, updated.getDateIso(), updated.getStartTime(), updated.getEndTime());

        return AppointmentResponseDto.fromEntity(updated);
    }

    // Cancels an existing appointment with IDOR security check and 3-hour notice policy
    public AppointmentResponseDto cancelAppointment(String id, String requesterEmail, boolean isStaff) {
        // Find target appointment in MongoDB by ID
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea nu a fost găsită."));

        // Anti-IDOR security check: regular clients can only cancel their own appointment
        verifyAppointmentOwnership(appointment, requesterEmail, isStaff, "anula");

        // Reject redundant cancellation request if already cancelled
        if ("CANCELLED".equalsIgnoreCase(appointment.getStatus())) {
            throw new IllegalArgumentException("Această programare este deja anulată.");
        }

        // Apply 3-hour advance notice rule for regular clients
        if (!isStaff) {
            enforceThreeHourCutoff(appointment, "anulări");
        }

        // Update status to CANCELLED and persist record
        appointment.setStatus("CANCELLED");
        Appointment updated = appointmentRepository.save(appointment);
        log.info("Cancelled appointment [{}] by {} (staff={})", id, requesterEmail, isStaff);

        // Map updated entity to response DTO
        return AppointmentResponseDto.fromEntity(updated);
    }

    // Updates appointment status (CONFIRMED -> COMPLETED / NO_SHOW / CANCELLED) by salon staff
    public AppointmentResponseDto updateStatus(String id, String newStatus) {
        // Retrieve appointment record by ID
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea cu ID-ul specificat nu există."));

        // Validate and normalize incoming status enum string
        String normalizedStatus = normalizeStatus(newStatus);

        // Apply new status and persist to MongoDB
        appointment.setStatus(normalizedStatus);
        Appointment saved = appointmentRepository.save(appointment);
        log.info("Updated appointment [{}] status to {}", id, saved.getStatus());

        // Return updated appointment entity as DTO
        return AppointmentResponseDto.fromEntity(saved);
    }

    /**
     * Anti-IDOR (Insecure Direct Object Reference) Ownership Guard:
     * Ensures that a regular client (non-staff) can only view, modify, or cancel an appointment
     * that actually belongs to them. Ownership is verified by matching the authenticated user's
     * email against appointment.clientEmail, or by matching their registered phone number against
     * appointment.clientPhone (for phone bookings linked to their account).
     *
     * Throws Spring Security's AccessDeniedException (mapped to HTTP 403 Forbidden) if ownership fails.
     */
    private void verifyAppointmentOwnership(
            Appointment appointment,
            String requesterEmail,
            boolean isStaff,
            String actionVerbRo) {

        if (isStaff) {
            // Staff members (BARBER and ADMIN) are authorized to manage salon appointments
            return;
        }

        if (requesterEmail == null || requesterEmail.isBlank()) {
            throw new AccessDeniedException(
                    "Autentificare necesară pentru a " + actionVerbRo + " această programare."
            );
        }

        String normalizedRequesterEmail = requesterEmail.trim().toLowerCase();
        String appointmentEmail = appointment.getClientEmail() != null
                ? appointment.getClientEmail().trim().toLowerCase()
                : "";

        // Primary ownership check: email match
        if (!appointmentEmail.isEmpty() && normalizedRequesterEmail.equalsIgnoreCase(appointmentEmail)) {
            return;
        }

        // Secondary ownership check: if the appointment was booked by phone or under another email,
        // check if the authenticated user's account phone number matches the appointment's clientPhone
        String appointmentPhone = normalizePhone(appointment.getClientPhone());
        if (!appointmentPhone.isEmpty()) {
            Optional<User> userOpt = userRepository.findByEmail(normalizedRequesterEmail);
            if (userOpt.isPresent() && userOpt.get().getPhone() != null) {
                String userPhone = normalizePhone(userOpt.get().getPhone());
                if (!userPhone.isEmpty() && userPhone.equals(appointmentPhone)) {
                    return;
                }
            }
        }

        log.warn("Anti-IDOR blocked attempt by '{}' to {} appointment [{}] owned by '{}'",
                requesterEmail, actionVerbRo, appointment.getId(), appointmentEmail);
        throw new AccessDeniedException(
                "Nu ai permisiunea de a " + actionVerbRo + " programarea altui client."
        );
    }

    /**
     * Enforces the 3-hour cutoff rule for client-initiated cancellations or rescheduling.
     */
    private void enforceThreeHourCutoff(Appointment appointment, String actionNounRo) {
        appointment.syncDateTimeFields();
        LocalDateTime startDateTime = appointment.getStartDateTime();
        if (startDateTime != null) {
            long minutesUntilStart = Duration.between(LocalDateTime.now(), startDateTime).toMinutes();
            if (minutesUntilStart < CANCELLATION_CUTOFF_HOURS * 60) {
                throw new IllegalArgumentException(
                        "Pentru " + actionNounRo + " cu mai puțin de 3 ore înainte, te rugăm să apelezi frizerul la: 0770 426 308"
                );
            }
        }
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            throw new IllegalArgumentException("Statusul programării este obligatoriu.");
        }
        String upper = status.trim().toUpperCase();
        return switch (upper) {
            case "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED" -> upper;
            default -> throw new IllegalArgumentException(
                    "Status invalid: " + status + ". Valori permise: CONFIRMED, COMPLETED, NO_SHOW, CANCELLED."
            );
        };
    }

    /**
     * Validates temporal business rules:
     * 1. Rejects bookings in the past.
     * 2. Enforces the 14-day (2-week) rolling booking window for clients.
     * 3. Ensures the appointment falls on an open day and within salon operating hours.
     */
    private void validateTemporalConstraints(
            LocalDate appointmentDate,
            LocalTime startLocalTime,
            LocalTime endLocalTime,
            LocalDateTime startDateTime) {

        LocalDate today = LocalDate.now();
        LocalDate maxAllowedDate = today.plusDays(MAX_BOOKING_HORIZON_DAYS);

        if (startDateTime.isBefore(LocalDateTime.now().minusMinutes(5))) {
            throw new IllegalArgumentException("Nu se pot efectua programări în trecut. Te rugăm să alegi o oră viitoare.");
        }

        if (appointmentDate.isAfter(maxAllowedDate)) {
            throw new IllegalArgumentException(
                    "Programările online se pot face cu cel mult " + MAX_BOOKING_HORIZON_DAYS + " de zile în avans (2 săptămâni)."
            );
        }

        if (appointmentDate.getDayOfWeek() == DayOfWeek.SUNDAY) {
            throw new IllegalArgumentException("Salonul este închis duminica. Te rugăm să alegi o altă zi.");
        }

        if (startLocalTime.isBefore(SALON_OPEN_TIME) || endLocalTime.isAfter(SALON_CLOSE_TIME)) {
            throw new IllegalArgumentException(
                    "Intervalul ales este în afara orelor de program ale salonului (09:00 - 21:00)."
            );
        }
    }

    /**
     * Prevents double-booking at save time by delegating the half-open interval intersection
     * check [newStart, newEnd) against all active client appointments and blocked intervals
     * to AvailabilityService.
     */
    private void validateNoTimeSlotOverlap(
            String barberSlug,
            String dateIso,
            int newStartMinutes,
            int newEndMinutes,
            String barberName) {

        availabilityService.assertSlotAvailable(barberSlug, dateIso, newStartMinutes, newEndMinutes, barberName);
    }

    /**
     * BUSINESS LOGIC: Enforces the Anti-No-Show policy to protect barbers from lost revenue.
     * 
     * HOW IT WORKS:
     * - Every appointment marked by a barber as 'NO_SHOW' (client did not arrive and did not cancel) is logged.
     * - If the client's phone number has accumulated 2 or more 'NO_SHOW' records, online self-booking is disabled.
     * - The client is asked to call the salon directly to confirm their commitment before booking again.
     */
    private void validateClientNoShowHistory(String rawPhone) {
        String normalizedPhone = normalizePhone(rawPhone);
        if (normalizedPhone.isEmpty()) {
            return;
        }

        long noShowCount = appointmentRepository.findAll().stream()
                .filter(app -> "NO_SHOW".equalsIgnoreCase(app.getStatus()))
                .filter(app -> normalizedPhone.equals(normalizePhone(app.getClientPhone())))
                .count();

        if (noShowCount >= MAX_ALLOWED_NO_SHOWS) {
            throw new IllegalArgumentException(
                    "Te rugăm să contactezi direct salonul la nr " + SALON_CONTACT_PHONE + " pentru o nouă programare."
            );
        }
    }

    /**
     * Normalizes Romanian phone numbers by stripping formatting characters and converting
     * +40 / 0040 / 40 prefixes into the canonical 10-digit '07xxxxxxxx' representation.
     */
    private String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return "";
        }
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("0040") && digits.length() == 13) {
            return "0" + digits.substring(4);
        }
        if (digits.startsWith("40") && digits.length() == 11) {
            return "0" + digits.substring(2);
        }
        if (digits.startsWith("7") && digits.length() == 9) {
            return "0" + digits;
        }
        return digits;
    }

    private String normalizeSource(String source) {
        if (source == null || source.isBlank()) {
            return "ONLINE";
        }
        String upper = source.trim().toUpperCase();
        return switch (upper) {
            case "PHONE", "MANUAL", "BLOCKED", "ONLINE" -> upper;
            default -> "ONLINE";
        };
    }

    private String formatRomanianDateLabel(LocalDate date) {
        String raw = date.format(RO_DATE_LABEL_FORMATTER);
        if (raw.isEmpty()) {
            return date.toString();
        }
        return Character.toUpperCase(raw.charAt(0)) + raw.substring(1);
    }
}
