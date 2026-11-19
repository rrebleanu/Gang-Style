package ro.gangstyle.api.dto;

import java.util.List;

/**
 * Response payload for GET /api/availability containing the barber's working hours
 * and the dynamically packed list of time slots for a specific date and service duration.
 */
public class AvailabilityResponseDto {

    private String barberSlug;
    private String barberName;
    private String dateIso;
    private boolean workingDay;
    private String workingHoursStart;
    private String workingHoursEnd;
    private int slotDurationMinutes;
    private int availableCount;
    private List<TimeSlotDto> slots;

    public AvailabilityResponseDto() {}

    public AvailabilityResponseDto(
            String barberSlug,
            String barberName,
            String dateIso,
            boolean workingDay,
            String workingHoursStart,
            String workingHoursEnd,
            int slotDurationMinutes,
            int availableCount,
            List<TimeSlotDto> slots) {
        this.barberSlug = barberSlug;
        this.barberName = barberName;
        this.dateIso = dateIso;
        this.workingDay = workingDay;
        this.workingHoursStart = workingHoursStart;
        this.workingHoursEnd = workingHoursEnd;
        this.slotDurationMinutes = slotDurationMinutes;
        this.availableCount = availableCount;
        this.slots = slots;
    }

    public String getBarberSlug() { return barberSlug; }
    public void setBarberSlug(String barberSlug) { this.barberSlug = barberSlug; }

    public String getBarberName() { return barberName; }
    public void setBarberName(String barberName) { this.barberName = barberName; }

    public String getDateIso() { return dateIso; }
    public void setDateIso(String dateIso) { this.dateIso = dateIso; }

    public boolean isWorkingDay() { return workingDay; }
    public void setWorkingDay(boolean workingDay) { this.workingDay = workingDay; }

    public String getWorkingHoursStart() { return workingHoursStart; }
    public void setWorkingHoursStart(String workingHoursStart) { this.workingHoursStart = workingHoursStart; }

    public String getWorkingHoursEnd() { return workingHoursEnd; }
    public void setWorkingHoursEnd(String workingHoursEnd) { this.workingHoursEnd = workingHoursEnd; }

    public int getSlotDurationMinutes() { return slotDurationMinutes; }
    public void setSlotDurationMinutes(int slotDurationMinutes) { this.slotDurationMinutes = slotDurationMinutes; }

    public int getAvailableCount() { return availableCount; }
    public void setAvailableCount(int availableCount) { this.availableCount = availableCount; }

    public List<TimeSlotDto> getSlots() { return slots; }
    public void setSlots(List<TimeSlotDto> slots) { this.slots = slots; }
}
