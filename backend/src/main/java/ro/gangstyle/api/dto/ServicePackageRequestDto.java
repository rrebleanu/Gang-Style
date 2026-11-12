package ro.gangstyle.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public class ServicePackageRequestDto {

    @NotBlank(message = "Selectarea frizerului este obligatorie.")
    private String barberSlug;

    @NotBlank(message = "Te rugăm să introduci denumirea serviciului.")
    @Size(max = 100, message = "Denumirea serviciului poate avea cel mult 100 de caractere.")
    private String name;

    @Positive(message = "Durata serviciului trebuie să fie mai mare de 0 minute.")
    private int durationMinutes;

    @Positive(message = "Intervalul alocat (slotul) trebuie să fie mai mare de 0 minute.")
    private int slotMinutes;

    @NotNull(message = "Te rugăm să introduci prețul serviciului.")
    @Positive(message = "Prețul serviciului trebuie să fie mai mare de 0 RON.")
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
