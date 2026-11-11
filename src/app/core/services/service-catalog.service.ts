import { Injectable } from '@angular/core';
import { ServiceItem, TimeSlot } from '../../shared/models/service-item.model';

interface BookedInterval {
  barberSlug: string;
  dateIso: string; // YYYY-MM-DD
  startMinutes: number; // minutes from 00:00
  endMinutes: number;
}

// Service catalog and smart slot generator (replaced by Spring Boot API later).
@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly services: ServiceItem[] = [
    // Filip packages
    {
      id: 's-filip-1',
      barberSlug: 'filip',
      name: 'Tuns & Styling',
      durationMinutes: 45,
      slotMinutes: 60,
      priceRon: 60,
    },
    {
      id: 's-filip-2',
      barberSlug: 'filip',
      name: 'Tuns + Barbă (Pachet Complet)',
      durationMinutes: 60,
      slotMinutes: 60,
      priceRon: 90,
    },
    {
      id: 's-filip-3',
      barberSlug: 'filip',
      name: 'Aranjat & Contur Barbă',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 40,
    },
    {
      id: 's-filip-4',
      barberSlug: 'filip',
      name: 'Tuns Clasic / Buzz Cut',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 50,
    },

    // Sebi packages
    {
      id: 's-sebi-1',
      barberSlug: 'sebi',
      name: 'Tuns & Styling',
      durationMinutes: 45,
      slotMinutes: 60,
      priceRon: 60,
    },
    {
      id: 's-sebi-2',
      barberSlug: 'sebi',
      name: 'Tuns + Barbă (Pachet Complet)',
      durationMinutes: 60,
      slotMinutes: 60,
      priceRon: 90,
    },
    {
      id: 's-sebi-3',
      barberSlug: 'sebi',
      name: 'Aranjat & Contur Barbă',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 40,
    },
    {
      id: 's-sebi-4',
      barberSlug: 'sebi',
      name: 'Tuns Clasic / Buzz Cut',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 50,
    },
  ];

  private readonly storageKey = 'gangstyle_bookings';

  getByBarberSlug(slug: string): ServiceItem[] {
    return this.services.filter((item) => item.barberSlug === slug.toLowerCase());
  }

  // Builds continuous daily slots (10:00 - 19:00) filtered by required slot duration
  getSlotsForDate(barberSlug: string, dateIso: string, service: ServiceItem): TimeSlot[] {
    const openMinutes = 10 * 60; // 10:00
    const closeMinutes = 19 * 60; // 19:00
    const step = service.slotMinutes; // 60 min or 30 min
    const occupied = this.getOccupiedForDay(barberSlug.toLowerCase(), dateIso);

    const slots: TimeSlot[] = [];

    for (let start = openMinutes; start + step <= closeMinutes; start += step) {
      const end = start + step;

      // A slot is available only if the entire [start, end] window is free
      const hasOverlap = occupied.some(
        (b) => start < b.endMinutes && end > b.startMinutes
      );

      const startTime = this.formatMinutes(start);
      const endTime = this.formatMinutes(end);

      slots.push({
        startTime,
        endTime,
        label: `${startTime} - ${endTime}`,
        available: !hasOverlap,
      });
    }

    return slots;
  }

  // Saves a real booking so only actually booked intervals become occupied
  addBooking(barberSlug: string, dateIso: string, startTime: string, slotMinutes: number): void {
    const startMinutes = this.parseMinutes(startTime);
    const allBookings = this.readStoredBookings();

    allBookings.push({
      barberSlug: barberSlug.toLowerCase(),
      dateIso,
      startMinutes,
      endMinutes: startMinutes + slotMinutes,
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(allBookings));
    }
  }

  private getOccupiedForDay(barberSlug: string, dateIso: string): BookedInterval[] {
    return this.readStoredBookings().filter(
      (b) => b.barberSlug === barberSlug && b.dateIso === dateIso
    );
  }

  private readStoredBookings(): BookedInterval[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as BookedInterval[]) : [];
    } catch {
      return [];
    }
  }

  private formatMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const mins = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

  private parseMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}
