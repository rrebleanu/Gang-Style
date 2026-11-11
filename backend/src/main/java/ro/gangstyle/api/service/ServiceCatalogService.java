package ro.gangstyle.api.service;

import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.ServicePackageResponseDto;
import ro.gangstyle.api.model.ServicePackage;
import ro.gangstyle.api.repository.ServicePackageRepository;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ServiceCatalogService {

    private final ServicePackageRepository servicePackageRepository;

    public ServiceCatalogService(ServicePackageRepository servicePackageRepository) {
        this.servicePackageRepository = servicePackageRepository;
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
