package ro.gangstyle.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ro.gangstyle.api.dto.AdminBarberStatsDto;
import ro.gangstyle.api.dto.AdminClientDto;
import ro.gangstyle.api.dto.AdminStatsDto;
import ro.gangstyle.api.model.Appointment;
import ro.gangstyle.api.model.Barber;
import ro.gangstyle.api.model.User;
import ro.gangstyle.api.repository.AppointmentRepository;
import ro.gangstyle.api.repository.BarberRepository;
import ro.gangstyle.api.repository.UserRepository;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AdminController
 * ---------------
 * Backend REST API strictly restricted to the ADMIN role (Owner / IT Administrator).
 * Protected at the framework level via Spring Security's @PreAuthorize("hasRole('ADMIN')").
 *
 * Responsibilities:
 * 1. GET /api/admin/users: Generates the full Client CRM dataset by correlating registered user
 *    accounts with historical appointment records.
 * 2. GET /api/admin/stats: Aggregates real-time business KPIs, per-barber weekly/monthly performance,
 *    client retention ratios (new vs. returning), and referral acquisition metrics.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserRepository userRepository;
    private final AppointmentRepository appointmentRepository;
    private final BarberRepository barberRepository;

    public AdminController(UserRepository userRepository,
                           AppointmentRepository appointmentRepository,
                           BarberRepository barberRepository) {
        this.userRepository = userRepository;
        this.appointmentRepository = appointmentRepository;
        this.barberRepository = barberRepository;
    }

    /**
     * GET /api/admin/users
     * Returns the complete CRM client list with aggregated metrics:
     * - Total bookings count and total revenue generated (LTV)
     * - Retention classification: Returning client (>= 2 visits) vs. New client (1 visit)
     * - Primary/favorite barber based on highest booking frequency
     * - Initial referral acquisition source (WhatsApp, Instagram, Friend referral, Direct Google)
     */
    @GetMapping("/users")
    public ResponseEntity<List<AdminClientDto>> getAllClients() {
        List<User> users = userRepository.findAll();
        List<Appointment> allAppointments = appointmentRepository.findAll();

        // Intermediate Logic: Build O(1) in-memory lookup indexes by email and normalized phone number.
        // This avoids costly nested O(N*M) database queries when correlating users with appointments.
        Map<String, List<Appointment>> byEmail = allAppointments.stream()
                .filter(a -> a.getClientEmail() != null && !a.getClientEmail().isBlank())
                .collect(Collectors.groupingBy(a -> a.getClientEmail().trim().toLowerCase()));

        Map<String, List<Appointment>> byPhone = allAppointments.stream()
                .filter(a -> a.getClientPhone() != null && !a.getClientPhone().isBlank())
                .collect(Collectors.groupingBy(a -> cleanPhone(a.getClientPhone())));

        List<AdminClientDto> dtos = new ArrayList<>();

        for (User u : users) {
            AdminClientDto dto = new AdminClientDto();
            dto.setId(u.getId());
            dto.setEmail(u.getEmail());
            dto.setDisplayName(u.getDisplayName());
            dto.setPhone(u.getPhone());
            dto.setRole(u.getRole());
            dto.setReferralSource(u.getReferralSource() != null ? u.getReferralSource() : "DIRECT_ORGANIC");
            dto.setReferralCode(u.getReferralCode());
            dto.setCreatedAt(u.getCreatedAt());

            // Merge appointments matched by either email or normalized phone number
            Set<Appointment> userApts = new HashSet<>();
            if (u.getEmail() != null) {
                userApts.addAll(byEmail.getOrDefault(u.getEmail().trim().toLowerCase(), List.of()));
            }
            if (u.getPhone() != null) {
                userApts.addAll(byPhone.getOrDefault(cleanPhone(u.getPhone()), List.of()));
            }

            // Exclude cancelled appointments from activity metrics
            int count = (int) userApts.stream().filter(a -> !"CANCELLED".equals(a.getStatus())).count();
            // Sum revenue strictly from confirmed or completed visits
            double spent = userApts.stream()
                    .filter(a -> "CONFIRMED".equals(a.getStatus()) || "COMPLETED".equals(a.getStatus()))
                    .mapToDouble(Appointment::getPriceRon)
                    .sum();

            dto.setAppointmentsCount(count);
            dto.setTotalSpentRon(spent);
            // Retention definition: 2 or more bookings classifies the user as a returning/loyal client
            dto.setReturningClient(count >= 2);

            // Determine favorite barber by grouping appointments per barber slug and finding the maximum count
            Map<String, Long> barberCounts = userApts.stream()
                    .filter(a -> a.getBarberSlug() != null)
                    .collect(Collectors.groupingBy(Appointment::getBarberSlug, Collectors.counting()));

            String favSlug = barberCounts.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse("-");

            dto.setFavoriteBarberSlug(favSlug);
            dto.setFavoriteBarberName(favSlug.equalsIgnoreCase("filip") ? "Filip" : (favSlug.equalsIgnoreCase("sebi") ? "Sebi" : "-"));

            // Extract latest appointment date string for recency tracking
            userApts.stream()
                    .filter(a -> a.getDateIso() != null)
                    .map(Appointment::getDateIso)
                    .max(String::compareTo)
                    .ifPresent(dto::setLastAppointmentDate);

            dtos.add(dto);
        }

        // Sort CRM list descending by account registration timestamp
        dtos.sort((a, b) -> {
            if (a.getCreatedAt() == null || b.getCreatedAt() == null) return 0;
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });

        return ResponseEntity.ok(dtos);
    }

    /**
     * GET /api/admin/stats
     * Computes real-time salon KPIs:
     * - Weekly & monthly appointment breakdown per barber
     * - Client acquisition retention: New vs. Returning clients
     * - Marketing attribution breakdown: WhatsApp, Instagram, Friends, Direct Google
     */
    @GetMapping("/stats")
    public ResponseEntity<AdminStatsDto> getAdminStats() {
        AdminStatsDto stats = new AdminStatsDto();

        List<User> users = userRepository.findAll();
        stats.setTotalRegisteredUsers(users.size());

        List<Appointment> allAppointments = appointmentRepository.findAll();
        // Filter out non-client blocked intervals and cancelled bookings
        List<Appointment> validAppointments = allAppointments.stream()
                .filter(a -> !"BLOCKED".equals(a.getSource()) && !"CANCELLED".equals(a.getStatus()))
                .toList();

        stats.setTotalAppointments(validAppointments.size());

        // Calculate total gross salon revenue in RON
        double totalRevenue = validAppointments.stream()
                .mapToDouble(Appointment::getPriceRon)
                .sum();
        stats.setTotalRevenueRon(totalRevenue);

        // Intermediate Logic: Compute exact calendar week boundaries (Monday to Sunday)
        // and current month prefix (YYYY-MM) for temporal slice comparisons.
        LocalDate today = LocalDate.now();
        LocalDate mondayThisWeek = today.with(DayOfWeek.MONDAY);
        LocalDate sundayThisWeek = today.with(DayOfWeek.SUNDAY);
        YearMonth currentYearMonth = YearMonth.from(today);

        String mondayIso = mondayThisWeek.toString();
        String sundayIso = sundayThisWeek.toString();
        String monthPrefix = currentYearMonth.toString(); // e.g., "2026-11"

        // Global retention analysis: Group valid bookings by distinct phone numbers
        Map<String, Long> clientBookingCounts = validAppointments.stream()
                .filter(a -> a.getClientPhone() != null && !a.getClientPhone().isBlank())
                .collect(Collectors.groupingBy(a -> cleanPhone(a.getClientPhone()), Collectors.counting()));

        // Exactly 1 booking = New client; 2+ bookings = Returning loyal client
        int globalReturning = (int) clientBookingCounts.values().stream().filter(c -> c >= 2).count();
        int globalNew = (int) clientBookingCounts.values().stream().filter(c -> c == 1).count();
        stats.setReturningClientsTotal(globalReturning);
        stats.setNewClientsTotal(globalNew);

        // Marketing referral source breakdown
        Map<String, Integer> refMap = new HashMap<>();
        int refCount = 0;
        int directCount = 0;

        for (Appointment apt : validAppointments) {
            String ref = apt.getReferralSource();
            if (ref == null || ref.isBlank() || "DIRECT_ORGANIC".equalsIgnoreCase(ref)) {
                directCount++;
                refMap.put("DIRECT_ORGANIC", refMap.getOrDefault("DIRECT_ORGANIC", 0) + 1);
            } else {
                refCount++;
                refMap.put(ref, refMap.getOrDefault(ref, 0) + 1);
            }
        }
        stats.setReferralBreakdown(refMap);
        stats.setTotalReferrals(refCount);
        stats.setTotalDirect(directCount);

        // Per-barber dynamic breakdown (Filip vs. Sebi)
        List<Barber> barbers = barberRepository.findAll();
        if (barbers.isEmpty()) {
            barbers = List.of(new Barber("filip", "Filip", "", "", List.of(), List.of()),
                              new Barber("sebi", "Sebi", "", "", List.of(), List.of()));
        }

        List<AdminBarberStatsDto> barberStatsList = new ArrayList<>();
        for (Barber b : barbers) {
            String slug = b.getSlug().toLowerCase();
            List<Appointment> barberApts = validAppointments.stream()
                    .filter(a -> a.getBarberSlug() != null && a.getBarberSlug().equalsIgnoreCase(slug))
                    .toList();

            AdminBarberStatsDto bDto = new AdminBarberStatsDto(slug, b.getName());
            bDto.setTotalAppointments(barberApts.size());

            // Weekly appointment count (matching ISO dates between Monday and Sunday)
            int weekly = (int) barberApts.stream()
                    .filter(a -> a.getDateIso() != null && a.getDateIso().compareTo(mondayIso) >= 0 && a.getDateIso().compareTo(sundayIso) <= 0)
                    .count();
            bDto.setWeeklyAppointments(weekly);

            // Monthly appointment count (matching YYYY-MM prefix)
            int monthly = (int) barberApts.stream()
                    .filter(a -> a.getDateIso() != null && a.getDateIso().startsWith(monthPrefix))
                    .count();
            bDto.setMonthlyAppointments(monthly);

            // Revenue generated by this barber's chair
            double bRevenue = barberApts.stream().mapToDouble(Appointment::getPriceRon).sum();
            bDto.setTotalRevenueRon(bRevenue);

            // Per-barber retention breakdown
            Map<String, Long> barberClientCounts = barberApts.stream()
                    .filter(a -> a.getClientPhone() != null && !a.getClientPhone().isBlank())
                    .collect(Collectors.groupingBy(a -> cleanPhone(a.getClientPhone()), Collectors.counting()));

            int bReturning = (int) barberClientCounts.values().stream().filter(c -> c >= 2).count();
            int bNew = (int) barberClientCounts.values().stream().filter(c -> c == 1).count();
            bDto.setReturningClientsCount(bReturning);
            bDto.setNewClientsCount(bNew);

            barberStatsList.add(bDto);
        }

        stats.setBarbers(barberStatsList);
        return ResponseEntity.ok(stats);
    }

    /**
     * Utility method to strip non-digit characters from phone numbers for consistent key matching.
     */
    private static String cleanPhone(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^0-9]", "");
    }
}
