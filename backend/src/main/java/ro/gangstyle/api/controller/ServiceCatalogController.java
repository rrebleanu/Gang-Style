package ro.gangstyle.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
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
}
