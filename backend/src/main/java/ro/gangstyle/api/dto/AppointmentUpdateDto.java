package ro.gangstyle.api.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request payload for updating or rescheduling an existing appointment via PUT /api/appointments/{id}.
 * Supports changing the date, start time, service package, client contact details, notes, or status.
 */
public class AppointmentUpdateDto {

    private String barberSlug;

    private String serviceId;
    private String serviceName;
    private Integer durationMinutes;
    private Double priceRon;

    @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "Data trebuie să fie în formatul YYYY-MM-DD.")
    private String dateIso;

    private String dateLabel;

    @Pattern(regexp = "^([01]\\d|2[0-3]):([0-5]\\d)$", message = "Ora de început trebuie să fie în formatul HH:mm.")
    private String startTime;

    @Size(min = 2, max = 60, message = "Prenumele trebuie să conțină între 2 și 60 de caractere.")
    private String clientFirstName;

    @Size(min = 2, max = 60, message = "Numele de familie trebuie să conțină între 2 și 60 de caractere.")
    private String clientLastName;

    @Pattern(regexp = "^[+0-9\\s()-]{9,16}$", message = "Numărul de telefon nu are un format valid.")
    private String clientPhone;

    @Size(max = 500, message = "Observațiile nu pot depăși 500 de caractere.")
    private String notes;

    @Pattern(
            regexp = "^(?i)(CONFIRMED|COMPLETED|NO_SHOW|CANCELLED)$",
            message = "Statusul trebuie să fie unul dintre: CONFIRMED, COMPLETED, NO_SHOW, CANCELLED."
    )
    private String status;

    public AppointmentUpdateDto() {}

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getServiceId() { return serviceId; }
    public void setServiceId(String serviceId) { this.serviceId = serviceId; }

    public String getServiceName() { return serviceName; }
    public void setServiceName(String serviceName) { this.serviceName = serviceName; }

    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }

    public Double getPriceRon() { return priceRon; }
    public void setPriceRon(Double priceRon) { this.priceRon = priceRon; }

    public String getDateIso() { return dateIso; }
    public void setDateIso(String dateIso) { this.dateIso = dateIso; }

    public String getDateLabel() { return dateLabel; }
    public void setDateLabel(String dateLabel) { this.dateLabel = dateLabel; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getClientFirstName() { return clientFirstName; }
    public void setClientFirstName(String clientFirstName) { this.clientFirstName = clientFirstName; }

    public String getClientLastName() { return clientLastName; }
    public void setClientLastName(String clientLastName) { this.clientLastName = clientLastName; }

    public String getClientPhone() { return clientPhone; }
    public void setClientPhone(String clientPhone) { this.clientPhone = clientPhone; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
