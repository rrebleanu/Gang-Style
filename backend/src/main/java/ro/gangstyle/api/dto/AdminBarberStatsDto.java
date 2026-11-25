package ro.gangstyle.api.dto;

/**
 * Performance and client retention metrics for an individual barber.
 */
public class AdminBarberStatsDto {

    private String barberSlug;
    private String barberName;
    private int weeklyAppointments;
    private int monthlyAppointments;
    private int totalAppointments;
    private int newClientsCount;
    private int returningClientsCount;
    private double totalRevenueRon;

    public AdminBarberStatsDto() {}

    public AdminBarberStatsDto(String barberSlug, String barberName) {
        this.barberSlug = barberSlug;
        this.barberName = barberName;
    }

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getBarberName() { return barberName; }
    public void setBarberName(String barberName) { this.barberName = barberName; }

    public int getWeeklyAppointments() { return weeklyAppointments; }
    public void setWeeklyAppointments(int weeklyAppointments) { this.weeklyAppointments = weeklyAppointments; }

    public int getMonthlyAppointments() { return monthlyAppointments; }
    public void setMonthlyAppointments(int monthlyAppointments) { this.monthlyAppointments = monthlyAppointments; }

    public int getTotalAppointments() { return totalAppointments; }
    public void setTotalAppointments(int totalAppointments) { this.totalAppointments = totalAppointments; }

    public int getNewClientsCount() { return newClientsCount; }
    public void setNewClientsCount(int newClientsCount) { this.newClientsCount = newClientsCount; }

    public int getReturningClientsCount() { return returningClientsCount; }
    public void setReturningClientsCount(int returningClientsCount) { this.returningClientsCount = returningClientsCount; }

    public double getTotalRevenueRon() { return totalRevenueRon; }
    public void setTotalRevenueRon(double totalRevenueRon) { this.totalRevenueRon = totalRevenueRon; }
}
