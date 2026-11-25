package ro.gangstyle.api.service;

import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.BarberResponseDto;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.model.Barber;
import ro.gangstyle.api.repository.BarberRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class BarberService {

    private final BarberRepository barberRepository;

    public BarberService(BarberRepository barberRepository) {
        this.barberRepository = barberRepository;
    }

    public List<BarberResponseDto> getAllBarbers() {
        return barberRepository.findAll().stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    public Optional<BarberResponseDto> getBarberBySlug(String slug) {
        return barberRepository.findBySlug(slug)
                .map(this::mapToDto);
    }

    public BarberResponseDto updatePortfolio(String slug, List<String> portfolio) {
        Barber barber = barberRepository.findBySlug(slug.toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("Frizerul selectat nu a fost găsit."));
        List<String> cleanPortfolio = portfolio != null ? new ArrayList<>(portfolio) : new ArrayList<>();
        if (cleanPortfolio.size() > 20) {
            cleanPortfolio = cleanPortfolio.subList(0, 20);
        }
        barber.setPortfolio(cleanPortfolio);
        Barber saved = barberRepository.save(barber);
        return mapToDto(saved);
    }

    private BarberResponseDto mapToDto(Barber barber) {
        return new BarberResponseDto(
                barber.getId(),
                barber.getSlug(),
                barber.getName(),
                barber.getBio(),
                barber.getPhotoUrl(),
                barber.getSpecialties(),
                barber.getPortfolio()
        );
    }
}
