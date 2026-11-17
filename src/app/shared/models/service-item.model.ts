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
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
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
