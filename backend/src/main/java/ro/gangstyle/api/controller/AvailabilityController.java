package ro.gangstyle.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ro.gangstyle.api.dto.AvailabilityResponseDto;
import ro.gangstyle.api.service.AvailabilityService;

/**
 * REST endpoints exposing daily free slot calculations (GET /api/availability)
 * where slot duration equals service duration, minus existing appointments and blocked intervals.
 */
@RestController
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    public AvailabilityController(AvailabilityService availabilityService) {
        this.availabilityService = availabilityService;
    }

    /**
     * GET /api/availability (and /api/appointments/availability)
     * Computes available slots for a given barber, ISO date, and service duration.
     */
    @GetMapping({"/api/availability", "/api/appointments/availability", "/availability"})
    public ResponseEntity<AvailabilityResponseDto> getAvailability(
            @RequestParam String barber,
            @RequestParam String date,
            @RequestParam(required = false) String serviceId,
            @RequestParam(required = false) Integer durationMinutes,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {

        AvailabilityResponseDto response = availabilityService.getDailyAvailability(
                barber,
                date,
                serviceId,
                durationMinutes,
                startTime,
                endTime
        );
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/barbers/{slug}/availability
     * Convenience route scoped by barber slug path parameter.
     */
    @GetMapping("/api/barbers/{slug}/availability")
    public ResponseEntity<AvailabilityResponseDto> getBarberAvailability(
            @PathVariable String slug,
            @RequestParam String date,
            @RequestParam(required = false) String serviceId,
            @RequestParam(required = false) Integer durationMinutes,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {

        AvailabilityResponseDto response = availabilityService.getDailyAvailability(
                slug,
                date,
                serviceId,
                durationMinutes,
                startTime,
                endTime
        );
        return ResponseEntity.ok(response);
    }
}
