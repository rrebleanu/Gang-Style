// Service package offered by a barber.
export interface ServiceItem {
  id: string;
  barberSlug: string;
  name: string;
  durationMinutes: number; // displayed duration (e.g. 45, 60, 30)
  slotMinutes: 30 | 60; // calendar block size to prevent 15-min dead gaps
  priceRon: number;
}

// Single time slot displayed in Step 2.
export interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
  available: boolean;
}
