package ro.gangstyle.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.gangstyle.api.dto.BarberResponseDto;
import ro.gangstyle.api.service.BarberService;

import java.util.List;

@RestController
@RequestMapping("/api/barbers")
@CrossOrigin(origins = {"http://localhost:4200", "http://127.0.0.1:4200"})
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
        return barberService.getBarberBySlug(slug)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
