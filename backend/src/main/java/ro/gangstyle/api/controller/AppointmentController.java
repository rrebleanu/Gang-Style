package ro.gangstyle.api.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;
import ro.gangstyle.api.dto.AppointmentRequestDto;
import ro.gangstyle.api.dto.AppointmentResponseDto;
import ro.gangstyle.api.dto.AppointmentStatusUpdateDto;
import ro.gangstyle.api.service.AppointmentService;

import java.util.List;

/**
 * REST Controller managing salon appointments: creation, personal history,
 * barber schedule views, cancellations, and status transitions.
 */
@RestController
@RequestMapping("/api/appointments")
public class AppointmentController {

    private final AppointmentService appointmentService;

    public AppointmentController(AppointmentService appointmentService) {
        this.appointmentService = appointmentService;
    }

    /**
     * POST /api/appointments
     * Creates a new appointment after validating barber availability, duration, and business rules.
     */
    @PostMapping
    public ResponseEntity<AppointmentResponseDto> createAppointment(
            @Valid @RequestBody AppointmentRequestDto request,
            Authentication authentication) {

        String authenticatedEmail = extractEmail(authentication);
        AppointmentResponseDto created = appointmentService.createAppointment(request, authenticatedEmail);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * GET /api/appointments/my
     * Returns all appointments associated with the currently authenticated user.
     */
    @GetMapping("/my")
    public ResponseEntity<List<AppointmentResponseDto>> getMyAppointments(
            @RequestParam(required = false) String phone,
            Authentication authentication) {

        String authenticatedEmail = extractEmail(authentication);
        List<AppointmentResponseDto> appointments = appointmentService.getMyAppointments(authenticatedEmail, phone);
        return ResponseEntity.ok(appointments);
    }

    /**
     * GET /api/appointments
     * Lists appointments filtered optionally by barber slug and/or ISO date (YYYY-MM-DD).
     */
    @GetMapping
    public ResponseEntity<List<AppointmentResponseDto>> getAppointments(
            @RequestParam(required = false) String barber,
            @RequestParam(required = false) String date) {

        return ResponseEntity.ok(appointmentService.getAppointments(barber, date));
    }

    /**
     * GET /api/appointments/barber/{slug}
     * Lists all appointments for a specific barber, optionally filtered by date.
     */
    @GetMapping("/barber/{slug}")
    public ResponseEntity<List<AppointmentResponseDto>> getBarberAppointments(
            @PathVariable String slug,
            @RequestParam(required = false) String date) {

        return ResponseEntity.ok(appointmentService.getAppointments(slug, date));
    }

    /**
     * PATCH /api/appointments/{id}/cancel
     * Cancels an appointment (enforces the 3-hour notice rule for clients).
     */
    @PatchMapping("/{id}/cancel")
    public ResponseEntity<AppointmentResponseDto> cancelAppointmentPatch(
            @PathVariable String id,
            Authentication authentication) {

        String requesterEmail = extractEmail(authentication);
        boolean isStaff = hasStaffAuthority(authentication);
        return ResponseEntity.ok(appointmentService.cancelAppointment(id, requesterEmail, isStaff));
    }

    /**
     * DELETE /api/appointments/{id}
     * Cancels/releases an appointment time slot.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<AppointmentResponseDto> cancelAppointmentDelete(
            @PathVariable String id,
            Authentication authentication) {

        String requesterEmail = extractEmail(authentication);
        boolean isStaff = hasStaffAuthority(authentication);
        return ResponseEntity.ok(appointmentService.cancelAppointment(id, requesterEmail, isStaff));
    }

    /**
     * PATCH /api/appointments/{id}/status
     * Allows barbers and admins to mark an appointment as COMPLETED, NO_SHOW, CONFIRMED, or CANCELLED.
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<AppointmentResponseDto> updateAppointmentStatus(
            @PathVariable String id,
            @Valid @RequestBody AppointmentStatusUpdateDto request) {

        return ResponseEntity.ok(appointmentService.updateStatus(id, request.getStatus()));
    }

    private String extractEmail(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        String principalName = authentication.getName();
        return "anonymousUser".equalsIgnoreCase(principalName) ? null : principalName;
    }

    private boolean hasStaffAuthority(Authentication authentication) {
        if (authentication == null || authentication.getAuthorities() == null) {
            return false;
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String role = authority.getAuthority();
            if ("ROLE_BARBER".equals(role) || "ROLE_ADMIN".equals(role)) {
                return true;
            }
        }
        return false;
    }
}
