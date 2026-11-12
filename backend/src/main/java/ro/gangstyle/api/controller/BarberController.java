package ro.gangstyle.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.gangstyle.api.dto.BarberResponseDto;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.service.BarberService;

import java.util.List;

@RestController
@RequestMapping("/api/barbers")
public class BarberController {

    private final BarberService barberService;

    public BarberController(BarberService barberService) {
        this.barberService = barberService;
    }

    @GetMapping
    public ResponseEntity<List<BarberResponseDto>> getAllBarbers() {
        return ResponseEntity.ok(barberService.getAllBarbers());
    }

    @GetMapping("/{slug}")
    public ResponseEntity<BarberResponseDto> getBarberBySlug(@PathVariable String slug) {
        BarberResponseDto barber = barberService.getBarberBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit."));
        return ResponseEntity.ok(barber);
    }
}
