package ro.gangstyle.api.dto;

import ro.gangstyle.api.model.Appointment;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * Response DTO returned to clients and staff dashboards representing a saved appointment.
 */
public class AppointmentResponseDto {

    private String id;
    private String barberSlug;
    private String barberName;
    private String barberPhotoUrl;

    private String serviceId;
    private String serviceName;
    private int durationMinutes;
    private int slotMinutes;
    private double priceRon;

    private String dateIso;
    private String dateLabel;
    private String startTime;
    private String endTime;
    private int startMinutes;
    private int endMinutes;
    private LocalDateTime startDateTime;
    private LocalDateTime endDateTime;

    private String clientFirstName;
    private String clientLastName;
    private String clientEmail;
    private String clientPhone;
    private String notes;

    private String source;
    private String status;
    private Instant createdAt;

    public AppointmentResponseDto() {}

    /**
     * Maps an Appointment persistence document to its public API representation.
     */
    public static AppointmentResponseDto fromEntity(Appointment appointment) {
        appointment.syncDateTimeFields();

        AppointmentResponseDto dto = new AppointmentResponseDto();
        dto.setId(appointment.getId());
        dto.setBarberSlug(appointment.getBarberSlug());
        dto.setBarberName(appointment.getBarberName());
        dto.setBarberPhotoUrl(appointment.getBarberPhotoUrl());
        dto.setServiceId(appointment.getServiceId());
        dto.setServiceName(appointment.getServiceName());
        dto.setDurationMinutes(appointment.getDurationMinutes());
        dto.setSlotMinutes(appointment.getSlotMinutes());
        dto.setPriceRon(appointment.getPriceRon());
        dto.setDateIso(appointment.getDateIso());
        dto.setDateLabel(appointment.getDateLabel());
        dto.setStartTime(appointment.getStartTime());
        dto.setEndTime(appointment.getEndTime());
        dto.setStartMinutes(appointment.getStartMinutes());
        dto.setEndMinutes(appointment.getEndMinutes());
        dto.setStartDateTime(appointment.getStartDateTime());
        dto.setEndDateTime(appointment.getEndDateTime());
        dto.setClientFirstName(appointment.getClientFirstName());
        dto.setClientLastName(appointment.getClientLastName());
        dto.setClientEmail(appointment.getClientEmail());
        dto.setClientPhone(appointment.getClientPhone());
        dto.setNotes(appointment.getNotes());
        dto.setSource(appointment.getSource());
        dto.setStatus(appointment.getStatus());
        dto.setCreatedAt(appointment.getCreatedAt());
        return dto;
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

    public LocalDateTime getStartDateTime() { return startDateTime; }
    public void setStartDateTime(LocalDateTime startDateTime) { this.startDateTime = startDateTime; }

    public LocalDateTime getEndDateTime() { return endDateTime; }
    public void setEndDateTime(LocalDateTime endDateTime) { this.endDateTime = endDateTime; }

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
