package ro.gangstyle.api.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

@Document(collection = "users")
public class User {

    @Id
    private String id;

    @Indexed(unique = true)
    private String email;

    private String password;
    private String displayName;
    private String phone;
    private String role; // CLIENT, BARBER, ADMIN
    private boolean twoFactorEnabled = false;
    private String twoFactorSecret;
    private String referralSource = "DIRECT_ORGANIC";
    private String referralCode;
    private Instant createdAt = Instant.now();

    public User() {}

    public User(String email, String password, String displayName, String phone, String role) {
        this.email = email;
        this.password = password;
        this.role = role;
        this.displayName = sanitizeDisplayName(displayName, role);
        this.phone = phone;
        this.createdAt = Instant.now();
    }

    public User(String email, String password, String displayName, String phone, String role, Instant createdAt) {
        this.email = email;
        this.password = password;
        this.role = role;
        this.displayName = sanitizeDisplayName(displayName, role);
        this.phone = phone;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public static String sanitizeDisplayName(String raw, String role) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String clean = raw.trim();
        // Dynamically strip any occupational suffix like "Frizer", "Barber", "Hairstylist", "Stilist"
        clean = clean.replaceAll("(?i)\\s*[-/|•·]?\\s*\\b(frizer|barber|hairstylist|stilist)\\b\\s*", " ").trim();
        if (!clean.isEmpty()) {
            String[] words = clean.split("\\s+");
            StringBuilder sb = new StringBuilder();
            for (String w : words) {
                if (!w.isEmpty()) {
                    if (sb.length() > 0) sb.append(" ");
                    sb.append(Character.toUpperCase(w.charAt(0)));
                    if (w.length() > 1) {
                        sb.append(w.substring(1));
                    }
                }
            }
            clean = sb.toString();
        }
        return clean.isEmpty() ? raw.trim() : clean;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = sanitizeDisplayName(displayName, this.role); }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public boolean isTwoFactorEnabled() { return twoFactorEnabled; }
    public void setTwoFactorEnabled(boolean twoFactorEnabled) { this.twoFactorEnabled = twoFactorEnabled; }

    public String getTwoFactorSecret() { return twoFactorSecret; }
    public void setTwoFactorSecret(String twoFactorSecret) { this.twoFactorSecret = twoFactorSecret; }

    public String getReferralSource() { return referralSource; }
    public void setReferralSource(String referralSource) { this.referralSource = referralSource; }

    public String getReferralCode() { return referralCode; }
    public void setReferralCode(String referralCode) { this.referralCode = referralCode; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
