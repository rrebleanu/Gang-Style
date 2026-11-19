package ro.gangstyle.api.dto;

/**
 * Represents a calculated time slot where slot length equals the selected service duration.
 */
public class TimeSlotDto {

    private String startTime;
    private String endTime;
    private String label;
    private int durationMinutes;
    private boolean available;

    public TimeSlotDto() {}

    public TimeSlotDto(String startTime, String endTime, String label, int durationMinutes, boolean available) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.label = label;
        this.durationMinutes = durationMinutes;
        this.available = available;
    }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }

    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
}
