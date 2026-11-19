package ro.gangstyle.api.service;

import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.AvailabilityResponseDto;
import ro.gangstyle.api.dto.TimeSlotDto;
import ro.gangstyle.api.exception.AppointmentConflictException;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.model.Appointment;
import ro.gangstyle.api.model.Barber;
import ro.gangstyle.api.model.ServicePackage;
import ro.gangstyle.api.repository.AppointmentRepository;
import ro.gangstyle.api.repository.BarberRepository;
import ro.gangstyle.api.repository.ServicePackageRepository;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Core interval engine that computes available time slots and enforces anti-overlap
 * constraints at save time.
 *
 * Formula:
 * Free Slots = Barber Schedule - Existing Client Appointments - Blocked Intervals (Breaks/Vacations)
 * where each generated slot duration equals the selected service duration (slotMinutes == durationMinutes).
 */
@Service
public class AvailabilityService {

    private static final String DEFAULT_START_TIME = "10:00";
    private static final String DEFAULT_END_TIME = "18:00";
    private static final int DEFAULT_DURATION_MINUTES = 30;
    private static final int MIN_DURATION_MINUTES = 10;
    private static final int PAST_SLOT_BUFFER_MINUTES = 5;

    private final AppointmentRepository appointmentRepository;
    private final BarberRepository barberRepository;
    private final ServicePackageRepository servicePackageRepository;

    public AvailabilityService(
            AppointmentRepository appointmentRepository,
            BarberRepository barberRepository,
            ServicePackageRepository servicePackageRepository) {
        this.appointmentRepository = appointmentRepository;
        this.barberRepository = barberRepository;
        this.servicePackageRepository = servicePackageRepository;
    }

    /**
     * Computes the daily availability grid for a barber on a given ISO date (YYYY-MM-DD).
     * Each slot is sized dynamically to match the exact duration of the selected service
     * (durationMinutes == slotMinutes) and packed tightly after any existing appointment or break.
     */
    public AvailabilityResponseDto getDailyAvailability(
            String barberSlug,
            String dateIso,
            String serviceId,
            Integer durationMinutesParam,
            String customStartTime,
            String customEndTime) {

        if (barberSlug == null || barberSlug.isBlank()) {
            throw new IllegalArgumentException("Parametrul 'barber' (slug-ul frizerului) este obligatoriu.");
        }
        if (dateIso == null || dateIso.isBlank()) {
            throw new IllegalArgumentException("Parametrul 'date' (format YYYY-MM-DD) este obligatoriu.");
        }

        String cleanSlug = barberSlug.trim().toLowerCase();
        Barber barber = barberRepository.findBySlug(cleanSlug)
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit: " + cleanSlug));

        LocalDate targetDate;
        try {
            targetDate = LocalDate.parse(dateIso.trim());
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Data trebuie să fie în formatul valid YYYY-MM-DD.");
        }

        // Resolve slot duration: service duration directly defines the time slot length (duration == slot)
        int duration = resolveServiceDuration(serviceId, durationMinutesParam);

        // Determine effective working window for the target day
        boolean hasCustomHours = customStartTime != null && !customStartTime.isBlank()
                && customEndTime != null && !customEndTime.isBlank();

        DayOfWeek dayOfWeek = targetDate.getDayOfWeek();
        boolean isStandardWorkingDay = dayOfWeek != DayOfWeek.SATURDAY && dayOfWeek != DayOfWeek.SUNDAY;
        boolean isWorkingDay = hasCustomHours || isStandardWorkingDay;

        String effectiveStart = hasCustomHours ? customStartTime.trim() : DEFAULT_START_TIME;
        String effectiveEnd = hasCustomHours ? customEndTime.trim() : DEFAULT_END_TIME;

        int openMinutes = parseMinutes(effectiveStart);
        int closeMinutes = parseMinutes(effectiveEnd);

        if (!isWorkingDay || openMinutes >= closeMinutes) {
            return new AvailabilityResponseDto(
                    barber.getSlug(),
                    barber.getName(),
                    targetDate.toString(),
                    false,
                    effectiveStart,
                    effectiveEnd,
                    duration,
                    0,
                    List.of()
            );
        }

        // Fetch all active (non-cancelled) appointments and blocked intervals for the barber on this date
        List<Appointment> occupied = appointmentRepository
                .findByBarberSlugAndDateIso(cleanSlug, targetDate.toString())
                .stream()
                .filter(apt -> !"CANCELLED".equalsIgnoreCase(apt.getStatus()))
                .sorted(Comparator.comparingInt(Appointment::getStartMinutes))
                .toList();

        // Check if the entire day is covered by a full-day block or vacation range
        boolean isFullDayBlocked = occupied.stream().anyMatch(apt ->
                "BLOCKED".equalsIgnoreCase(apt.getSource())
                        && resolveStartMinutes(apt) <= openMinutes
                        && resolveEndMinutes(apt) >= closeMinutes
        );

        if (isFullDayBlocked) {
            return new AvailabilityResponseDto(
                    barber.getSlug(),
                    barber.getName(),
                    targetDate.toString(),
                    false,
                    effectiveStart,
                    effectiveEnd,
                    duration,
                    0,
                    List.of()
            );
        }

        List<TimeSlotDto> slots = new ArrayList<>();
        Set<String> emittedOccupiedIds = new HashSet<>();
        int cursor = openMinutes;

        // Dynamic interval packing loop:
        // Packs slots of length `duration` across [openMinutes, closeMinutes].
        // Whenever an existing appointment or blocked break is encountered, the cursor jumps
        // directly to the end of that obstacle so zero dead time is wasted between appointments.
        while (cursor + duration <= closeMinutes) {
            int candidateEnd = cursor + duration;
            final int candidateStart = cursor;

            Optional<Appointment> overlappingOpt = occupied.stream()
                    .filter(apt -> intervalsOverlap(
                            candidateStart,
                            candidateEnd,
                            resolveStartMinutes(apt),
                            resolveEndMinutes(apt)
                    ))
                    .findFirst();

            if (overlappingOpt.isPresent()) {
                Appointment overlapping = overlappingOpt.get();
                int obsStart = resolveStartMinutes(overlapping);
                int obsEnd = resolveEndMinutes(overlapping);

                // Emit existing client appointments as unavailable slots (available = false)
                // while keeping personal barber breaks/blocks (source == BLOCKED) completely hidden.
                if (!"BLOCKED".equalsIgnoreCase(overlapping.getSource())
                        && overlapping.getId() != null
                        && !emittedOccupiedIds.contains(overlapping.getId())
                        && obsStart >= openMinutes
                        && obsEnd <= closeMinutes) {

                    emittedOccupiedIds.add(overlapping.getId());
                    String sTime = formatMinutes(obsStart);
                    String eTime = formatMinutes(obsEnd);
                    slots.add(new TimeSlotDto(
                            sTime,
                            eTime,
                            sTime + " - " + eTime,
                            obsEnd - obsStart,
                            false
                    ));
                }

                // Advance cursor directly to the end of the overlapping appointment or blocked break
                cursor = Math.max(cursor + 5, obsEnd);
                continue;
            }

            String startStr = formatMinutes(cursor);
            String endStr = formatMinutes(candidateEnd);
            slots.add(new TimeSlotDto(
                    startStr,
                    endStr,
                    startStr + " - " + endStr,
                    duration,
                    true
            ));
            cursor += duration;
        }

        // Sort all generated and occupied slots chronologically by start time
        slots.sort(Comparator.comparingInt(slot -> parseMinutes(slot.getStartTime())));

        // If querying today's schedule, dynamically filter out slots that have already passed
        if (targetDate.equals(LocalDate.now())) {
            LocalTime now = LocalTime.now();
            int cutoffMinutes = now.getHour() * 60 + now.getMinute() + PAST_SLOT_BUFFER_MINUTES;
            slots = slots.stream()
                    .filter(slot -> parseMinutes(slot.getStartTime()) >= cutoffMinutes)
                    .toList();
        }

        int availableCount = (int) slots.stream().filter(TimeSlotDto::isAvailable).count();

        return new AvailabilityResponseDto(
                barber.getSlug(),
                barber.getName(),
                targetDate.toString(),
                true,
                effectiveStart,
                effectiveEnd,
                duration,
                availableCount,
                slots
        );
    }

    /**
     * Save-time verification: asserts that a requested [newStartMinutes, newEndMinutes) interval
     * does not overlap with any active client appointment or barber blocked interval (break / day off / vacation).
     * Throws AppointmentConflictException (HTTP 409) if an intersection is detected.
     */
    public void assertSlotAvailable(
            String barberSlug,
            String dateIso,
            int newStartMinutes,
            int newEndMinutes,
            String barberName) {

        assertSlotAvailable(barberSlug, dateIso, newStartMinutes, newEndMinutes, barberName, null);
    }

    /**
     * Save-time and update-time verification: checks that the requested [newStartMinutes, newEndMinutes)
     * interval does not intersect any other active appointment or blocked interval on the given date.
     * When rescheduling an existing appointment via PUT, its own ID is passed as excludeAppointmentId
     * so it never conflicts with its previous time slot.
     */
    public void assertSlotAvailable(
            String barberSlug,
            String dateIso,
            int newStartMinutes,
            int newEndMinutes,
            String barberName,
            String excludeAppointmentId) {

        List<Appointment> existingOnDate = appointmentRepository.findByBarberSlugAndDateIso(barberSlug, dateIso);

        for (Appointment existing : existingOnDate) {
            if ("CANCELLED".equalsIgnoreCase(existing.getStatus())) {
                continue;
            }

            // Skip self when updating/rescheduling an existing appointment via PUT /api/appointments/{id}
            if (excludeAppointmentId != null && excludeAppointmentId.equals(existing.getId())) {
                continue;
            }

            int existingStart = resolveStartMinutes(existing);
            int existingEnd = resolveEndMinutes(existing);

            // Half-open interval intersection test: [A_start, A_end) intersects [B_start, B_end) iff A_start < B_end && A_end > B_start
            if (intervalsOverlap(newStartMinutes, newEndMinutes, existingStart, existingEnd)) {
                if ("BLOCKED".equalsIgnoreCase(existing.getSource())) {
                    throw new AppointmentConflictException(
                            String.format(
                                    "Intervalul orar %s - %s este indisponibil (blocat/pauză) la %s. Te rugăm să alegi alt interval.",
                                    formatMinutes(existingStart),
                                    formatMinutes(existingEnd),
                                    barberName
                            )
                    );
                }

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
     * Half-open interval overlap check: returns true if [startA, endA) and [startB, endB) share any common minutes.
     */
    public boolean intervalsOverlap(int startA, int endA, int startB, int endB) {
        return startA < endB && endA > startB;
    }

    private int resolveServiceDuration(String serviceId, Integer durationMinutesParam) {
        if (serviceId != null && !serviceId.isBlank()) {
            Optional<ServicePackage> serviceOpt = servicePackageRepository.findById(serviceId.trim());
            if (serviceOpt.isPresent()) {
                ServicePackage srv = serviceOpt.get();
                int dur = srv.getDurationMinutes() > 0 ? srv.getDurationMinutes() : srv.getSlotMinutes();
                return Math.max(MIN_DURATION_MINUTES, dur);
            }
        }
        if (durationMinutesParam != null && durationMinutesParam > 0) {
            return Math.max(MIN_DURATION_MINUTES, Math.min(durationMinutesParam, 240));
        }
        return DEFAULT_DURATION_MINUTES;
    }

    private int resolveStartMinutes(Appointment apt) {
        if (apt.getStartMinutes() > 0) {
            return apt.getStartMinutes();
        }
        return apt.getStartTime() != null ? parseMinutes(apt.getStartTime()) : 0;
    }

    private int resolveEndMinutes(Appointment apt) {
        int start = resolveStartMinutes(apt);
        if (apt.getEndMinutes() > start) {
            return apt.getEndMinutes();
        }
        if (apt.getEndTime() != null && !apt.getEndTime().isBlank()) {
            int parsedEnd = parseMinutes(apt.getEndTime());
            if (parsedEnd > start) {
                return parsedEnd;
            }
        }
        return start + Math.max(apt.getDurationMinutes(), DEFAULT_DURATION_MINUTES);
    }

    private int parseMinutes(String timeStr) {
        try {
            String[] parts = timeStr.trim().split(":");
            int hours = Integer.parseInt(parts[0]);
            int minutes = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            return hours * 60 + minutes;
        } catch (Exception ex) {
            return 0;
        }
    }

    private String formatMinutes(int totalMinutes) {
        int hours = Math.max(0, totalMinutes / 60);
        int mins = Math.max(0, totalMinutes % 60);
        return String.format("%02d:%02d", hours, mins);
    }
}
