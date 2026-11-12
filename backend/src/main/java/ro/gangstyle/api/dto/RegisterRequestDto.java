package ro.gangstyle.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * DTO for new client account registration.
 */
public class RegisterRequestDto {

    @NotBlank(message = "Te rugăm să introduci adresa de email.")
    @Email(message = "Adresa de email nu este validă.")
    private String email;

    @NotBlank(message = "Te rugăm să alegi o parolă.")
    @Size(min = 6, max = 100, message = "Parola trebuie să conțină cel puțin 6 caractere.")
    private String password;

    @NotBlank(message = "Te rugăm să introduci numele tău complet.")
    @Size(min = 2, max = 80, message = "Numele trebuie să conțină cel puțin 2 caractere.")
    private String displayName;

    @NotBlank(message = "Te rugăm să introduci numărul de telefon.")
    @Size(min = 9, max = 20, message = "Numărul de telefon nu este valid.")
    private String phone;

    public RegisterRequestDto() {}

    public RegisterRequestDto(String email, String password, String displayName, String phone) {
        this.email = email;
        this.password = password;
        this.displayName = displayName;
        this.phone = phone;
    }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
}
