package ro.gangstyle.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class LoginRequestDto {

    @NotBlank(message = "Te rugăm să introduci adresa de email.")
    @Email(message = "Adresa de email nu este validă.")
    private String email;

    @NotBlank(message = "Te rugăm să introduci parola.")
    private String password;

    public LoginRequestDto() {}

    public LoginRequestDto(String email, String password) {
        this.email = email;
        this.password = password;
    }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
