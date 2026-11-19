package ro.gangstyle.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.AppointmentRequestDto;
import ro.gangstyle.api.dto.AppointmentResponseDto;
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

    // Salon business constraints
    private static final int MAX_BOOKING_HORIZON_DAYS = 30;
    private static final int MAX_ALLOWED_NO_SHOWS = 2;
    private static final long CANCELLATION_CUTOFF_HOURS = 3;
    private static final LocalTime SALON_OPEN_TIME = LocalTime.of(9, 0);
    private static final LocalTime SALON_CLOSE_TIME = LocalTime.of(21, 0);
    private static final String SALON_CONTACT_PHONE = "0770426308";

    private final AppointmentRepository appointmentRepository;
    private final BarberRepository barberRepository;
    private final ServicePackageRepository servicePackageRepository;
    private final UserRepository userRepository;

    public AppointmentService(
            AppointmentRepository appointmentRepository,
            BarberRepository barberRepository,
            ServicePackageRepository servicePackageRepository,
            UserRepository userRepository) {
        this.appointmentRepository = appointmentRepository;
        this.barberRepository = barberRepository;
        this.servicePackageRepository = servicePackageRepository;
        this.userRepository = userRepository;
    }

    /**
     * Creates and persists a new appointment after executing temporal, anti-overlap,
     * and anti-no-show business validations.
     */
    public AppointmentResponseDto createAppointment(AppointmentRequestDto request, String authenticatedEmail) {
        String barberSlug = request.getBarberSlug().trim().toLowerCase();

        // 1. Resolve target barber profile
        Barber barber = barberRepository.findBySlug(barberSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit: " + barberSlug));

        // 2. Resolve service package from MongoDB or fallback to validated request metadata
        Optional<ServicePackage> serviceOpt = servicePackageRepository.findById(request.getServiceId().trim());
        String serviceName;
        int durationMinutes;
        int slotMinutes;
        double priceRon;

        if (serviceOpt.isPresent()) {
            ServicePackage service = serviceOpt.get();
            serviceName = service.getName();
            durationMinutes = service.getDurationMinutes();
            slotMinutes = service.getSlotMinutes() > 0 ? service.getSlotMinutes() : durationMinutes;
            priceRon = service.getPriceRon();
        } else if (request.getServiceName() != null && request.getDurationMinutes() != null && request.getPriceRon() != null) {
            serviceName = request.getServiceName().trim();
            durationMinutes = request.getDurationMinutes();
            slotMinutes = durationMinutes;
            priceRon = request.getPriceRon();
        } else {
            throw new ResourceNotFoundException("Pachetul de servicii selectat nu există.");
        }

        if (durationMinutes <= 0 || durationMinutes > 240) {
            throw new IllegalArgumentException("Durata serviciului trebuie să fie între 15 și 240 de minute.");
        }

        // 3. Parse LocalDate and LocalTime to compute exact LocalDateTime interval boundaries
        LocalDate appointmentDate;
        LocalTime startLocalTime;
        try {
            appointmentDate = LocalDate.parse(request.getDateIso().trim());
            startLocalTime = LocalTime.parse(request.getStartTime().trim(), TIME_FORMATTER);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Formatul datei (YYYY-MM-DD) sau al orei (HH:mm) este invalid.");
        }

        LocalDateTime startDateTime = LocalDateTime.of(appointmentDate, startLocalTime);
        LocalDateTime endDateTime = startDateTime.plusMinutes(durationMinutes);
        LocalTime endLocalTime = endDateTime.toLocalTime();

        // Convert start and end times into minutes from midnight for fast interval intersection math
        int startMinutes = startLocalTime.getHour() * 60 + startLocalTime.getMinute();
        int endMinutes = startMinutes + durationMinutes;

        String source = normalizeSource(request.getSource());
        boolean isOnlineClientBooking = "ONLINE".equalsIgnoreCase(source);

        // 4. Execute custom temporal and salon schedule validations for online bookings
        if (isOnlineClientBooking) {
            validateTemporalConstraints(appointmentDate, startLocalTime, endLocalTime, startDateTime);
            validateClientNoShowHistory(request.getClientPhone());
        }

        // 5. Anti-Overlap Validation: ensure no active appointment intersects [startMinutes, endMinutes)
        validateNoTimeSlotOverlap(barberSlug, appointmentDate.toString(), startMinutes, endMinutes, barber.getName());

        // 6. Format human-readable Romanian date label if omitted by the caller
        String dateLabel = (request.getDateLabel() != null && !request.getDateLabel().isBlank())
                ? request.getDateLabel().trim()
                : formatRomanianDateLabel(appointmentDate);

        // Determine client email: prefer explicitly provided email, otherwise bind to authenticated user
        String clientEmail = (request.getClientEmail() != null && !request.getClientEmail().isBlank())
                ? request.getClientEmail().trim().toLowerCase()
                : (authenticatedEmail != null ? authenticatedEmail.trim().toLowerCase() : "");

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

        Appointment saved = appointmentRepository.save(appointment);
        log.info("Created appointment [{}] for barber '{}' on {} ({}-{})",
                saved.getId(), barberSlug, saved.getDateIso(), saved.getStartTime(), saved.getEndTime());

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
     * Cancels an existing appointment. Enforces the 3-hour cutoff rule when invoked by a regular client,
     * while allowing barbers and administrators to cancel at any time.
     */
    public AppointmentResponseDto cancelAppointment(String id, String requesterEmail, boolean isStaff) {
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea nu a fost găsită."));

        if ("CANCELLED".equalsIgnoreCase(appointment.getStatus())) {
            throw new IllegalArgumentException("Această programare este deja anulată.");
        }

        // If the requester is a regular client, verify ownership and enforce the 3-hour cutoff rule
        if (!isStaff) {
            if (requesterEmail != null && appointment.getClientEmail() != null
                    && !appointment.getClientEmail().isBlank()
                    && !requesterEmail.equalsIgnoreCase(appointment.getClientEmail().trim())) {
                throw new IllegalArgumentException("Nu ai permisiunea de a anula programarea altui client.");
            }

            appointment.syncDateTimeFields();
            LocalDateTime startDateTime = appointment.getStartDateTime();
            if (startDateTime != null) {
                long minutesUntilStart = Duration.between(LocalDateTime.now(), startDateTime).toMinutes();
                if (minutesUntilStart < CANCELLATION_CUTOFF_HOURS * 60) {
                    throw new IllegalArgumentException(
                            "Pentru anulări cu mai puțin de 3 ore înainte, te rugăm să apelezi frizerul la: 0770 426 308"
                    );
                }
            }
        }

        appointment.setStatus("CANCELLED");
        Appointment updated = appointmentRepository.save(appointment);
        log.info("Cancelled appointment [{}] by {} (staff={})", id, requesterEmail, isStaff);

        return AppointmentResponseDto.fromEntity(updated);
    }

    /**
     * Updates the lifecycle status of an appointment (CONFIRMED, COMPLETED, NO_SHOW, CANCELLED).
     * Restricted to staff roles (BARBER, ADMIN).
     */
    public AppointmentResponseDto updateStatus(String id, String newStatus) {
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Programarea cu ID-ul specificat nu există."));

        appointment.setStatus(newStatus.trim().toUpperCase());
        Appointment saved = appointmentRepository.save(appointment);
        log.info("Updated appointment [{}] status to {}", id, saved.getStatus());

        return AppointmentResponseDto.fromEntity(saved);
    }

    /**
     * Validates temporal business rules:
     * 1. Rejects bookings in the past.
     * 2. Enforces the 30-day rolling booking window for clients.
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
                    "Programările online se pot face cu cel mult " + MAX_BOOKING_HORIZON_DAYS + " de zile în avans."
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
     * Prevents double-booking by verifying that no active (non-cancelled) appointment
     * for the same barber and date overlaps with the requested [newStart, newEnd) window.
     */
    private void validateNoTimeSlotOverlap(
            String barberSlug,
            String dateIso,
            int newStartMinutes,
            int newEndMinutes,
            String barberName) {

        List<Appointment> existingOnDate = appointmentRepository.findByBarberSlugAndDateIso(barberSlug, dateIso);

        for (Appointment existing : existingOnDate) {
            if ("CANCELLED".equalsIgnoreCase(existing.getStatus())) {
                continue;
            }

            int existingStart = existing.getStartMinutes();
            int existingEnd = existing.getEndMinutes() > existingStart
                    ? existing.getEndMinutes()
                    : existingStart + Math.max(existing.getDurationMinutes(), 30);

            // Half-open interval intersection test: [A_start, A_end) overlaps [B_start, B_end) iff A_start < B_end && A_end > B_start
            if (newStartMinutes < existingEnd && newEndMinutes > existingStart) {
                throw new AppointmentConflictException(
                        String.format(
                                "Intervalul orar %s - %s este deja ocupat la %s. Te rugăm să alegi alt interval disponibil.",
                                existing.getStartTime(),
                                existing.getEndTime(),
                                barberName
                        )
                );
            }
        }
    }

    /**
     * Checks whether the client phone number has accumulated 2 or more NO_SHOW appointments.
     * Unreliable clients are blocked from booking online and instructed to call the salon directly.
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
