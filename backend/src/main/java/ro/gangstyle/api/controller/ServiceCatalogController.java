package ro.gangstyle.api.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.gangstyle.api.dto.ServicePackageRequestDto;
import ro.gangstyle.api.dto.ServicePackageResponseDto;
import ro.gangstyle.api.service.ServiceCatalogService;

import java.util.List;

@RestController
@RequestMapping("/api/services")
@CrossOrigin(origins = {"http://localhost:4200", "http://127.0.0.1:4200"})
public class ServiceCatalogController {

    private final ServiceCatalogService serviceCatalogService;

    public ServiceCatalogController(ServiceCatalogService serviceCatalogService) {
        this.serviceCatalogService = serviceCatalogService;
    }

    @GetMapping
    public ResponseEntity<List<ServicePackageResponseDto>> getServices(
            @RequestParam(required = false) String barber) {
        return ResponseEntity.ok(serviceCatalogService.getServices(barber));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServicePackageResponseDto> getServiceById(@PathVariable String id) {
        return serviceCatalogService.getServiceById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ServicePackageResponseDto> createService(@Valid @RequestBody ServicePackageRequestDto request) {
        ServicePackageResponseDto created = serviceCatalogService.createService(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServicePackageResponseDto> updateService(
            @PathVariable String id,
            @Valid @RequestBody ServicePackageRequestDto request) {
        ServicePackageResponseDto updated = serviceCatalogService.updateService(id, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteService(@PathVariable String id) {
        serviceCatalogService.deleteService(id);
        return ResponseEntity.noContent().build();
    }
}
