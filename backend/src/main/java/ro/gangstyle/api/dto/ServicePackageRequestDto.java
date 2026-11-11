package ro.gangstyle.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public class ServicePackageRequestDto {

    @NotBlank(message = "barberSlug este obligatoriu (ex: 'filip' sau 'sebi')")
    private String barberSlug;

    @NotBlank(message = "Numele serviciului este obligatoriu")
    private String name;

    @Positive(message = "Durata trebuie sa fie un numar pozitiv de minute")
    private int durationMinutes;

    @Positive(message = "Slotul trebuie sa fie un numar pozitiv de minute (ex: 30, 45, 60)")
    private int slotMinutes;

    @NotNull(message = "Pretul este obligatoriu")
    @Positive(message = "Pretul trebuie sa fie mai mare decat 0 RON")
    private Double priceRon;

    public ServicePackageRequestDto() {}

    public ServicePackageRequestDto(String barberSlug, String name, int durationMinutes, int slotMinutes, Double priceRon) {
        this.barberSlug = barberSlug;
        this.name = name;
        this.durationMinutes = durationMinutes;
        this.slotMinutes = slotMinutes;
        this.priceRon = priceRon;
    }

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }

    public int getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(int slotMinutes) { this.slotMinutes = slotMinutes; }

    public Double getPriceRon() { return priceRon; }
    public void setPriceRon(Double priceRon) { this.priceRon = priceRon; }
}
