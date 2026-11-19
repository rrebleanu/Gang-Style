package ro.gangstyle.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request payload for creating a new appointment (online by client or manual by barber/admin).
 */
public class AppointmentRequestDto {

    @NotBlank(message = "Selectarea frizerului este obligatorie.")
    private String barberSlug;

    @NotBlank(message = "Selectarea serviciului este obligatorie.")
    private String serviceId;

    // Optional fallback fields if service metadata is provided directly by the client
    private String serviceName;
    private Integer durationMinutes;
    private Double priceRon;

    @NotBlank(message = "Data programării este obligatorie (format YYYY-MM-DD).")
    @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "Data trebuie să fie în formatul YYYY-MM-DD.")
    private String dateIso;

    private String dateLabel;

    @NotBlank(message = "Ora de început este obligatorie (format HH:mm).")
    @Pattern(regexp = "^([01]\\d|2[0-3]):([0-5]\\d)$", message = "Ora de început trebuie să fie în formatul HH:mm.")
    private String startTime;

    @NotBlank(message = "Prenumele clientului este obligatoriu.")
    @Size(min = 2, max = 60, message = "Prenumele trebuie să conțină între 2 și 60 de caractere.")
    private String clientFirstName;

    @NotBlank(message = "Numele de familie al clientului este obligatoriu.")
    @Size(min = 2, max = 60, message = "Numele de familie trebuie să conțină între 2 și 60 de caractere.")
    private String clientLastName;

    @Email(message = "Adresa de email introdusă nu este validă.")
    private String clientEmail;

    @NotBlank(message = "Numărul de telefon este obligatoriu.")
    @Pattern(regexp = "^[+0-9\\s()-]{9,16}$", message = "Numărul de telefon nu are un format valid.")
    private String clientPhone;

    @Size(max = 500, message = "Observațiile nu pot depăși 500 de caractere.")
    private String notes;

    // Booking origin: ONLINE (default), PHONE, MANUAL, BLOCKED
    private String source;

    public AppointmentRequestDto() {}

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

    public String getClientEmail() { return clientEmail; }
    public void setClientEmail(String clientEmail) { this.clientEmail = clientEmail; }

    public String getClientPhone() { return clientPhone; }
    public void setClientPhone(String clientPhone) { this.clientPhone = clientPhone; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
