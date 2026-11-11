package ro.gangstyle.api.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "services")
public class ServicePackage {

    @Id
    private String id;

    private String barberSlug; // filip, sebi
    private String name;
    private int durationMinutes;
    private int slotMinutes; // 30 or 60
    private double priceRon;

    public ServicePackage() {}

    public ServicePackage(String barberSlug, String name, int durationMinutes, int slotMinutes, double priceRon) {
        this.barberSlug = barberSlug;
        this.name = name;
        this.durationMinutes = durationMinutes;
        this.slotMinutes = slotMinutes;
        this.priceRon = priceRon;
    }

    public ServicePackage(String id, String barberSlug, String name, int durationMinutes, int slotMinutes, double priceRon) {
        this.id = id;
        this.barberSlug = barberSlug;
        this.name = name;
        this.durationMinutes = durationMinutes;
        this.slotMinutes = slotMinutes;
        this.priceRon = priceRon;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }

    public int getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(int slotMinutes) { this.slotMinutes = slotMinutes; }

    public double getPriceRon() { return priceRon; }
    public void setPriceRon(double priceRon) { this.priceRon = priceRon; }
}
