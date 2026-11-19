// Service package offered by a barber.
export interface ServiceItem {
  id: string;
  barberSlug: string;
  name: string;
  durationMinutes: number;
  slotMinutes: number;
  priceRon: number;
}

// Single time slot displayed in Step 2.
export interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
  available: boolean;
}

// Full appointment record persisted in storage (and MongoDB later).
export interface AppointmentRecord {
  id: string;
  barberSlug: string;
  barberName: string;
  barberPhotoUrl: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  slotMinutes: number;
  priceRon: number;
  dateIso: string; // YYYY-MM-DD
  dateLabel: string; // e.g. Sâmbătă, 14 Noiembrie
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  startMinutes: number;
  endMinutes: number;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  notes?: string;
  source?: 'ONLINE' | 'PHONE' | 'BLOCKED';
  blockType?: 'INTERVAL' | 'FULL_DAY' | 'VACATION';
  vacationGroupId?: string;
  endDateIso?: string;
  endDateLabel?: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  createdAt: string;
}

// Working hours configuration for a single day of the week (0 = Sunday ... 6 = Saturday).
export interface BarberDaySchedule {
  dayOfWeek: number;
  dayName: string;
  working: boolean;
  startTime: string;
  endTime: string;
}

// Barber schedule profile persisted per barber (standard salon schedule vs custom weekly schedule).
export interface BarberScheduleConfig {
  barberSlug: string;
  mode: 'STANDARD' | 'CUSTOM';
  days: BarberDaySchedule[];
  updatedAt: string;
}

// Grouped view item for active barber time blocks, days off, or vacation ranges.
export interface BarberBlockSummary {
  id: string;
  barberSlug: string;
  blockType: 'INTERVAL' | 'FULL_DAY' | 'VACATION';
  dateIso: string;
  endDateIso?: string;
  label: string;
  timeLabel: string;
  reason: string;
}

// Date-specific extra working day or extended hours added by a barber without altering their recurring schedule.
export interface BarberExtraAvailability {
  id: string;
  barberSlug: string;
  dateIso: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  note: string;
  createdAt: string;
}

// Anti-No-Show Blacklist record managed by Admin / Barbers.
export interface BlacklistEntry {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  reason: string;
  noShowCount: number;
  addedBy: string;
  createdAt: string;
}
