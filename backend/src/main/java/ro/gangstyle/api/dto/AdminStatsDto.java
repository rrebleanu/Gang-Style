package ro.gangstyle.api.dto;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Aggregated salon metrics for the Owner/Admin dashboard.
 */
public class AdminStatsDto {

    private int totalRegisteredUsers;
    private int totalAppointments;
    private double totalRevenueRon;
    private int newClientsTotal;
    private int returningClientsTotal;

    // Breakdown per barber (Filip, Sebi)
    private List<AdminBarberStatsDto> barbers = new ArrayList<>();

    // Referral sources count: WHATSAPP_SHARE, INSTAGRAM_BIO, FRIEND_REF, DIRECT_ORGANIC
    private Map<String, Integer> referralBreakdown = new HashMap<>();
    private int totalReferrals;
    private int totalDirect;

    public AdminStatsDto() {}

    public int getTotalRegisteredUsers() { return totalRegisteredUsers; }
    public void setTotalRegisteredUsers(int totalRegisteredUsers) { this.totalRegisteredUsers = totalRegisteredUsers; }

    public int getTotalAppointments() { return totalAppointments; }
    public void setTotalAppointments(int totalAppointments) { this.totalAppointments = totalAppointments; }

    public double getTotalRevenueRon() { return totalRevenueRon; }
    public void setTotalRevenueRon(double totalRevenueRon) { this.totalRevenueRon = totalRevenueRon; }

    public int getNewClientsTotal() { return newClientsTotal; }
    public void setNewClientsTotal(int newClientsTotal) { this.newClientsTotal = newClientsTotal; }

    public int getReturningClientsTotal() { return returningClientsTotal; }
    public void setReturningClientsTotal(int returningClientsTotal) { this.returningClientsTotal = returningClientsTotal; }

    public List<AdminBarberStatsDto> getBarbers() { return barbers; }
    public void setBarbers(List<AdminBarberStatsDto> barbers) { this.barbers = barbers; }

    public Map<String, Integer> getReferralBreakdown() { return referralBreakdown; }
    public void setReferralBreakdown(Map<String, Integer> referralBreakdown) { this.referralBreakdown = referralBreakdown; }

    public int getTotalReferrals() { return totalReferrals; }
    public void setTotalReferrals(int totalReferrals) { this.totalReferrals = totalReferrals; }

    public int getTotalDirect() { return totalDirect; }
    public void setTotalDirect(int totalDirect) { this.totalDirect = totalDirect; }
}
