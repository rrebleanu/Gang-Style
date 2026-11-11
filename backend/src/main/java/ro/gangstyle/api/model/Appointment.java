package ro.gangstyle.api.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

@Document(collection = "appointments")
public class Appointment {

    @Id
    private String id;

    private String barberSlug; // filip, sebi
    private String barberName;
    private String barberPhotoUrl;

    private String serviceId;
    private String serviceName;
    private int durationMinutes;
    private int slotMinutes;
    private double priceRon;

    private String dateIso; // YYYY-MM-DD
    private String dateLabel;
    private String startTime; // HH:mm
    private String endTime;   // HH:mm
    private int startMinutes;
    private int endMinutes;

    private String clientFirstName;
    private String clientLastName;
    private String clientEmail;
    private String clientPhone;
    private String notes;

    private String source = "ONLINE"; // ONLINE, PHONE, BLOCKED
    private String status = "CONFIRMED"; // CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
    private Instant createdAt = Instant.now();

    public Appointment() {}

    public Appointment(String barberSlug, String barberName, String barberPhotoUrl,
                       String serviceId, String serviceName, int durationMinutes, int slotMinutes,
                       double priceRon, String dateIso, String dateLabel, String startTime,
                       String endTime, int startMinutes, int endMinutes, String clientFirstName,
                       String clientLastName, String clientEmail, String clientPhone,
                       String notes, String source, String status, Instant createdAt) {
        this.barberSlug = barberSlug;
        this.barberName = barberName;
        this.barberPhotoUrl = barberPhotoUrl;
        this.serviceId = serviceId;
        this.serviceName = serviceName;
        this.durationMinutes = durationMinutes;
        this.slotMinutes = slotMinutes;
        this.priceRon = priceRon;
        this.dateIso = dateIso;
        this.dateLabel = dateLabel;
        this.startTime = startTime;
        this.endTime = endTime;
        this.startMinutes = startMinutes;
        this.endMinutes = endMinutes;
        this.clientFirstName = clientFirstName;
        this.clientLastName = clientLastName;
        this.clientEmail = clientEmail;
        this.clientPhone = clientPhone;
        this.notes = notes;
        this.source = source != null ? source : "ONLINE";
        this.status = status != null ? status : "CONFIRMED";
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getBarberName() { return barberName; }
    public void setBarberName(String barberName) { this.barberName = barberName; }

    public String getBarberPhotoUrl() { return barberPhotoUrl; }
    public void setBarberPhotoUrl(String barberPhotoUrl) { this.barberPhotoUrl = barberPhotoUrl; }

    public String getServiceId() { return serviceId; }
    public void setServiceId(String serviceId) { this.serviceId = serviceId; }

    public String getServiceName() { return serviceName; }
    public void setServiceName(String serviceName) { this.serviceName = serviceName; }

    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }

    public int getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(int slotMinutes) { this.slotMinutes = slotMinutes; }

    public double getPriceRon() { return priceRon; }
    public void setPriceRon(double priceRon) { this.priceRon = priceRon; }

    public String getDateIso() { return dateIso; }
    public void setDateIso(String dateIso) { this.dateIso = dateIso; }

    public String getDateLabel() { return dateLabel; }
    public void setDateLabel(String dateLabel) { this.dateLabel = dateLabel; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public int getStartMinutes() { return startMinutes; }
    public void setStartMinutes(int startMinutes) { this.startMinutes = startMinutes; }

    public int getEndMinutes() { return endMinutes; }
    public void setEndMinutes(int endMinutes) { this.endMinutes = endMinutes; }

    public String getClientFirstName() { return clientFirstName; }
    public void setClientFirstName(String clientFirstName) { this.clientFirstName = clientFirstName; }

    public String getClientLastName() { return clientLastName; }
    public void setClientLastName(String clientLastName) { this.clientLastName = clientLastName; }

    public String getClientEmail() { return clientEmail; }
    public void setClientEmail(String clientEmail) { this.clientEmail = clientEmail; }

    public String getClientPhone() { return clientPhone; }
    public void setClientPhone(String clientPhone) { this.clientPhone = clientPhone; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
