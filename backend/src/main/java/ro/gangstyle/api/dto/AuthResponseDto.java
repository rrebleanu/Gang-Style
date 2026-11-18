package ro.gangstyle.api.dto;

// DTO returned after authentication or 2FA state transition.
public class AuthResponseDto {

    private String token;
    private String email;
    private String displayName;
    private String phone;
    private String role; // ROLE_ADMIN, ROLE_BARBER, ROLE_CLIENT, or ROLE_PRE_AUTH
    private boolean requiresTwoFactor;
    private boolean twoFactorEnabled;

    public AuthResponseDto() {}

    public AuthResponseDto(String token, String email, String displayName, String phone, String role) {
        this(token, email, displayName, phone, role, false, false);
    }

    public AuthResponseDto(
            String token,
            String email,
            String displayName,
            String phone,
            String role,
            boolean requiresTwoFactor,
            boolean twoFactorEnabled) {
        this.token = token;
        this.email = email;
        this.displayName = displayName;
        this.phone = phone;
        this.role = role;
        this.requiresTwoFactor = requiresTwoFactor;
        this.twoFactorEnabled = twoFactorEnabled;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public boolean isRequiresTwoFactor() { return requiresTwoFactor; }
    public void setRequiresTwoFactor(boolean requiresTwoFactor) { this.requiresTwoFactor = requiresTwoFactor; }

    public boolean isTwoFactorEnabled() { return twoFactorEnabled; }
    public void setTwoFactorEnabled(boolean twoFactorEnabled) { this.twoFactorEnabled = twoFactorEnabled; }
}
