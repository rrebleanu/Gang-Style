package ro.gangstyle.api.service;

import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.ServicePackageRequestDto;
import ro.gangstyle.api.dto.ServicePackageResponseDto;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.model.ServicePackage;
import ro.gangstyle.api.repository.BarberRepository;
import ro.gangstyle.api.repository.ServicePackageRepository;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ServiceCatalogService {

    private final ServicePackageRepository servicePackageRepository;
    private final BarberRepository barberRepository;

    public ServiceCatalogService(ServicePackageRepository servicePackageRepository, BarberRepository barberRepository) {
        this.servicePackageRepository = servicePackageRepository;
        this.barberRepository = barberRepository;
    }

    public List<ServicePackageResponseDto> getServices(String barberSlug) {
        List<ServicePackage> list;
        if (barberSlug != null && !barberSlug.isBlank()) {
            list = servicePackageRepository.findByBarberSlug(barberSlug);
        } else {
            list = servicePackageRepository.findAll();
        }

        return list.stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    public Optional<ServicePackageResponseDto> getServiceById(String id) {
        return servicePackageRepository.findById(id).map(this::mapToDto);
    }

    public ServicePackageResponseDto createService(ServicePackageRequestDto dto) {
        // Validare existență frizer
        if (!barberRepository.existsBySlug(dto.getBarberSlug())) {
            throw new IllegalArgumentException("Frizerul cu slug-ul '" + dto.getBarberSlug() + "' nu există.");
        }

        ServicePackage entity = new ServicePackage(
                dto.getBarberSlug(),
                dto.getName(),
                dto.getDurationMinutes(),
                dto.getSlotMinutes(),
                dto.getPriceRon()
        );

        ServicePackage saved = servicePackageRepository.save(entity);
        return mapToDto(saved);
    }

    public ServicePackageResponseDto updateService(String id, ServicePackageRequestDto dto) {
        ServicePackage existing = servicePackageRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Serviciul cu ID-ul " + id + " nu a fost găsit."));

        if (!barberRepository.existsBySlug(dto.getBarberSlug())) {
            throw new IllegalArgumentException("Frizerul cu slug-ul '" + dto.getBarberSlug() + "' nu există.");
        }

        existing.setBarberSlug(dto.getBarberSlug());
        existing.setName(dto.getName());
        existing.setDurationMinutes(dto.getDurationMinutes());
        existing.setSlotMinutes(dto.getSlotMinutes());
        existing.setPriceRon(dto.getPriceRon());

        ServicePackage saved = servicePackageRepository.save(existing);
        return mapToDto(saved);
    }

    public void deleteService(String id) {
        if (!servicePackageRepository.existsById(id)) {
            throw new ResourceNotFoundException("Serviciul cu ID-ul " + id + " nu a fost găsit.");
        }
        servicePackageRepository.deleteById(id);
    }

    public ServicePackageResponseDto mapToDto(ServicePackage sp) {
        return new ServicePackageResponseDto(
                sp.getId(),
                sp.getBarberSlug(),
                sp.getName(),
                sp.getDurationMinutes(),
                sp.getSlotMinutes(),
                sp.getPriceRon()
        );
    }
}
