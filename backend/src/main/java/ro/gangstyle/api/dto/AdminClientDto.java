package ro.gangstyle.api.dto;

import java.time.Instant;

/**
 * Data Transfer Object representing a registered user / CRM client for the Admin portal.
 */
public class AdminClientDto {

    private String id;
    private String email;
    private String displayName;
    private String phone;
    private String role;
    private String referralSource;
    private String referralCode;
    private Instant createdAt;

    // Computed booking metrics
    private int appointmentsCount;
    private double totalSpentRon;
    private String favoriteBarberSlug;
    private String favoriteBarberName;
    private String lastAppointmentDate;
    private boolean returningClient; // true = 2+ bookings (fidel), false = 1 booking (client nou)

    public AdminClientDto() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getReferralSource() { return referralSource; }
    public void setReferralSource(String referralSource) { this.referralSource = referralSource; }

    public String getReferralCode() { return referralCode; }
    public void setReferralCode(String referralCode) { this.referralCode = referralCode; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public int getAppointmentsCount() { return appointmentsCount; }
    public void setAppointmentsCount(int appointmentsCount) { this.appointmentsCount = appointmentsCount; }

    public double getTotalSpentRon() { return totalSpentRon; }
    public void setTotalSpentRon(double totalSpentRon) { this.totalSpentRon = totalSpentRon; }

    public String getFavoriteBarberSlug() { return favoriteBarberSlug; }
    public void setFavoriteBarberSlug(String favoriteBarberSlug) { this.favoriteBarberSlug = favoriteBarberSlug; }

    public String getFavoriteBarberName() { return favoriteBarberName; }
    public void setFavoriteBarberName(String favoriteBarberName) { this.favoriteBarberName = favoriteBarberName; }

    public String getLastAppointmentDate() { return lastAppointmentDate; }
    public void setLastAppointmentDate(String lastAppointmentDate) { this.lastAppointmentDate = lastAppointmentDate; }

    public boolean isReturningClient() { return returningClient; }
    public void setReturningClient(boolean returningClient) { this.returningClient = returningClient; }
}
