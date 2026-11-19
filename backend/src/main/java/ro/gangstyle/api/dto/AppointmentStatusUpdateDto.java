package ro.gangstyle.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Payload used by barbers or administrators to update an appointment's lifecycle status.
 */
public class AppointmentStatusUpdateDto {

    @NotBlank(message = "Noul status al programării este obligatoriu.")
    @Pattern(
            regexp = "^(CONFIRMED|CANCELLED|COMPLETED|NO_SHOW)$",
            message = "Status invalid. Valorile permise sunt: CONFIRMED, CANCELLED, COMPLETED, NO_SHOW."
    )
    private String status;

    public AppointmentStatusUpdateDto() {}

    public AppointmentStatusUpdateDto(String status) {
        this.status = status;
    }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
