package ro.gangstyle.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// DTO for verifying a 6-digit TOTP code during 2FA setup or login.
public class TwoFactorVerifyRequestDto {

    @NotBlank(message = "Codul 2FA este obligatoriu.")
    @Pattern(regexp = "^\\d{6}$", message = "Codul 2FA trebuie să fie format din exact 6 cifre.")
    private String code;

    private String tempToken;

    public TwoFactorVerifyRequestDto() {}

    public TwoFactorVerifyRequestDto(String code, String tempToken) {
        this.code = code;
        this.tempToken = tempToken;
    }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getTempToken() { return tempToken; }
    public void setTempToken(String tempToken) { this.tempToken = tempToken; }
}
