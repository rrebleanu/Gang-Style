import { Injectable } from '@angular/core';
import {
  AppointmentRecord,
  BlacklistEntry,
  ServiceItem,
  TimeSlot,
} from '../../shared/models/service-item.model';

// Service catalog (CRUD), slot generator, appointment storage, and Anti-No-Show Blacklist service.
@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly storageKey = 'gangstyle_appointments_v3';
  private readonly servicesStorageKey = 'gangstyle_services_v1';
  private readonly blacklistStorageKey = 'gangstyle_blacklist_v1';

  private readonly defaultServices: ServiceItem[] = [
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
      name: 'Tuns + Barbă',
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
      name: 'Tuns + Barbă',
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

  // Returns all service packages (persisted in localStorage)
  getAllServices(): ServiceItem[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [...this.defaultServices];
    }
    try {
      const raw = window.localStorage.getItem(this.servicesStorageKey);
      if (!raw) {
        this.saveServices(this.defaultServices);
        return [...this.defaultServices];
      }
      return JSON.parse(raw) as ServiceItem[];
    } catch {
      return [...this.defaultServices];
    }
  }

  getByBarberSlug(slug: string): ServiceItem[] {
    return this.getAllServices().filter(
      (item) => item.barberSlug === slug.toLowerCase()
    );
  }

  // CRUD Create: Adds a new service package for Filip, Sebi, or both barbers
  addServicePackage(payload: {
    barberTarget: 'filip' | 'sebi' | 'both';
    name: string;
    durationMinutes: number;
    priceRon: number;
  }): ServiceItem[] {
    const all = this.getAllServices();
    const slotMinutes: 30 | 60 = payload.durationMinutes <= 30 ? 30 : 60;
    const targets: ('filip' | 'sebi')[] =
      payload.barberTarget === 'both' ? ['filip', 'sebi'] : [payload.barberTarget];

    const created: ServiceItem[] = targets.map((slug) => ({
      id: `s-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      barberSlug: slug,
      name: payload.name.trim(),
      durationMinutes: Number(payload.durationMinutes),
      slotMinutes,
      priceRon: Number(payload.priceRon),
    }));

    const updated = [...all, ...created];
    this.saveServices(updated);
    return created;
  }

  // CRUD Update: Modifies name, duration, and price of an existing service package
  updateServicePackage(
    id: string,
    changes: { name: string; durationMinutes: number; priceRon: number }
  ): boolean {
    const all = this.getAllServices();
    const target = all.find((s) => s.id === id);
    if (!target) {
      return false;
    }

    target.name = changes.name.trim();
    target.durationMinutes = Number(changes.durationMinutes);
    target.slotMinutes = Number(changes.durationMinutes) <= 30 ? 30 : 60;
    target.priceRon = Number(changes.priceRon);

    this.saveServices(all);
    return true;
  }

  // CRUD Delete: Removes a service package
  deleteServicePackage(id: string): boolean {
    const all = this.getAllServices();
    const filtered = all.filter((s) => s.id !== id);
    if (filtered.length === all.length) {
      return false;
    }
    this.saveServices(filtered);
    return true;
  }

  // Anti-No-Show Blacklist CRUD
  getBlacklist(): BlacklistEntry[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(this.blacklistStorageKey);
      if (!raw) {
        const initial: BlacklistEntry[] = [
          {
            id: 'blk-user-1',
            clientName: 'Stan Bogdan',
            clientPhone: '766 009 112',
            clientEmail: 'bogdan.stan@yahoo.com',
            reason: '2 neprezentări consecutive fără să anunțe telefonic',
            noShowCount: 2,
            addedBy: 'Filip',
            createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
          },
        ];
        this.saveBlacklist(initial);
        return initial;
      }
      return JSON.parse(raw) as BlacklistEntry[];
    } catch {
      return [];
    }
  }

  addToBlacklist(payload: {
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    reason: string;
    noShowCount?: number;
    addedBy?: string;
  }): BlacklistEntry {
    const list = this.getBlacklist();
    const cleanPhone = payload.clientPhone.replace(/\s+/g, '');
    const existing = list.find(
      (b) => b.clientPhone.replace(/\s+/g, '') === cleanPhone
    );

    if (existing) {
      existing.noShowCount += 1;
      existing.reason = payload.reason.trim() || existing.reason;
      this.saveBlacklist(list);
      return existing;
    }

    const entry: BlacklistEntry = {
      id: 'blk-user-' + Date.now(),
      clientName: payload.clientName.trim(),
      clientPhone: payload.clientPhone.trim(),
      clientEmail: payload.clientEmail?.trim(),
      reason: payload.reason.trim() || 'Neprezentare (No-Show)',
      noShowCount: payload.noShowCount ?? 1,
      addedBy: payload.addedBy ?? 'Admin',
      createdAt: new Date().toISOString(),
    };

    list.unshift(entry);
    this.saveBlacklist(list);
    return entry;
  }

  removeFromBlacklist(id: string): boolean {
    const list = this.getBlacklist();
    const filtered = list.filter((b) => b.id !== id);
    if (filtered.length === list.length) {
      return false;
    }
    this.saveBlacklist(filtered);
    return true;
  }

  private saveServices(list: ServiceItem[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.servicesStorageKey, JSON.stringify(list));
    }
  }

  private saveBlacklist(list: BlacklistEntry[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.blacklistStorageKey, JSON.stringify(list));
    }
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

      // Slot is available only if the entire [start, end] window is free
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

  // Creates and persists a full appointment record
  createAppointment(
    payload: Omit<AppointmentRecord, 'id' | 'startMinutes' | 'endMinutes' | 'status' | 'createdAt'>
  ): AppointmentRecord {
    const startMinutes = this.parseMinutes(payload.startTime);
    const endMinutes = startMinutes + payload.slotMinutes;

    const record: AppointmentRecord = {
      ...payload,
      id: 'apt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      barberSlug: payload.barberSlug.toLowerCase(),
      clientEmail: payload.clientEmail.trim().toLowerCase(),
      source: payload.source ?? 'ONLINE',
      startMinutes,
      endMinutes,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const all = this.getAllAppointments();
    all.unshift(record);
    this.saveAppointments(all);

    return record;
  }

  // Blocks a time interval or full day for a barber (occupies slots on the public site)
  blockTimeInterval(params: {
    barberSlug: string;
    barberName: string;
    barberPhotoUrl: string;
    dateIso: string;
    dateLabel: string;
    startTime: string;
    endTime: string;
    reason: string;
  }): AppointmentRecord {
    const startMinutes = this.parseMinutes(params.startTime);
    const endMinutes = this.parseMinutes(params.endTime);
    const durationMinutes = Math.max(30, endMinutes - startMinutes);

    const record: AppointmentRecord = {
      id: 'blk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      barberSlug: params.barberSlug.toLowerCase(),
      barberName: params.barberName,
      barberPhotoUrl: params.barberPhotoUrl,
      serviceId: 'blocked',
      serviceName: params.reason || 'Interval Blocat / Pauză',
      durationMinutes,
      slotMinutes: 60,
      priceRon: 0,
      dateIso: params.dateIso,
      dateLabel: params.dateLabel,
      startTime: params.startTime,
      endTime: params.endTime,
      startMinutes,
      endMinutes,
      clientFirstName: 'Interval',
      clientLastName: 'Blocat',
      clientEmail: 'blocked@gangstyle.ro',
      clientPhone: '-',
      notes: params.reason || 'Indisponibil',
      source: 'BLOCKED',
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const all = this.getAllAppointments();
    all.unshift(record);
    this.saveAppointments(all);
    return record;
  }

  // Returns appointments for the logged-in client (excludes barber blocked intervals)
  getAppointmentsByEmail(email: string): AppointmentRecord[] {
    const clean = email.trim().toLowerCase();
    const all = this.getAllAppointments().filter((a) => a.source !== 'BLOCKED');
    const matched = all.filter(
      (a) => a.clientEmail === clean || a.clientEmail === 'demo@gangstyle.ro'
    );
    return matched.length > 0 ? matched : all;
  }

  // Returns all appointments and blocked intervals for a specific barber
  getAppointmentsByBarber(barberSlug: string): AppointmentRecord[] {
    const clean = barberSlug.trim().toLowerCase();
    return this.getAllAppointments().filter((a) => a.barberSlug === clean);
  }

  // Updates an appointment status (COMPLETED, NO_SHOW, CANCELLED, CONFIRMED)
  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentRecord['status']
  ): boolean {
    const all = this.getAllAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) {
      return false;
    }

    target.status = status;
    this.saveAppointments(all);
    return true;
  }

  // Returns all stored appointments (seeds realistic initial data on first visit)
  getAllAppointments(): AppointmentRecord[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        const seeded = this.buildInitialAppointments();
        this.saveAppointments(seeded);
        return seeded;
      }
      return JSON.parse(raw) as AppointmentRecord[];
    } catch {
      return [];
    }
  }

  // Cancels an appointment and frees the time slot in the calendar
  cancelAppointment(appointmentId: string): boolean {
    const all = this.getAllAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) {
      return false;
    }

    target.status = 'CANCELLED';
    this.saveAppointments(all);
    return true;
  }

  // Checks if at least 3 hours remain before the appointment starts
  canCancelAppointment(apt: AppointmentRecord): boolean {
    if (apt.status !== 'CONFIRMED') {
      return false;
    }
    const aptDate = this.buildAppointmentDate(apt.dateIso, apt.startTime);
    const diffMs = aptDate.getTime() - Date.now();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    return diffMs >= threeHoursMs;
  }

  // Checks if an appointment is in the past
  isPastAppointment(apt: AppointmentRecord): boolean {
    const aptDate = this.buildAppointmentDate(apt.dateIso, apt.endTime);
    return aptDate.getTime() < Date.now();
  }

  private getOccupiedForDay(barberSlug: string, dateIso: string): AppointmentRecord[] {
    return this.getAllAppointments().filter(
      (b) =>
        b.barberSlug === barberSlug &&
        b.dateIso === dateIso &&
        b.status === 'CONFIRMED'
    );
  }

  private saveAppointments(list: AppointmentRecord[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(list));
    }
  }

  private buildAppointmentDate(dateIso: string, time: string): Date {
    const [yyyy, mm, dd] = dateIso.split('-').map(Number);
    const [hh, min] = time.split(':').map(Number);
    return new Date(yyyy, mm - 1, dd, hh, min, 0);
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

  // Seeds initial online & phone appointments so both Client and Barber dashboards are immediately testable
  private buildInitialAppointments(): AppointmentRecord[] {
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 1);
    // Avoid Sunday (0) and Monday (1)
    while (upcomingDate.getDay() === 0 || upcomingDate.getDay() === 1) {
      upcomingDate.setDate(upcomingDate.getDate() + 1);
    }

    const upcomingDate2 = new Date(upcomingDate);
    upcomingDate2.setDate(upcomingDate2.getDate() + 1);
    while (upcomingDate2.getDay() === 0 || upcomingDate2.getDay() === 1) {
      upcomingDate2.setDate(upcomingDate2.getDate() + 1);
    }

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    return [
      {
        id: 'apt-demo-upcoming-1',
        barberSlug: 'filip',
        barberName: 'Filip',
        barberPhotoUrl: 'images/Filip.jpg',
        serviceId: 's-filip-2',
        serviceName: 'Tuns + Barbă',
        durationMinutes: 60,
        slotMinutes: 60,
        priceRon: 90,
        dateIso: this.toIsoDate(upcomingDate),
        dateLabel: this.toRoDateLabel(upcomingDate),
        startTime: '14:00',
        endTime: '15:00',
        startMinutes: 14 * 60,
        endMinutes: 15 * 60,
        clientFirstName: 'Andrei',
        clientLastName: 'Popescu',
        clientEmail: 'demo@gangstyle.ro',
        clientPhone: '770 426 308',
        notes: 'Skin fade mediu + contur barbă cu briciul',
        source: 'ONLINE',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'apt-demo-phone-1',
        barberSlug: 'filip',
        barberName: 'Filip',
        barberPhotoUrl: 'images/Filip.jpg',
        serviceId: 's-filip-1',
        serviceName: 'Tuns & Styling',
        durationMinutes: 45,
        slotMinutes: 60,
        priceRon: 60,
        dateIso: this.toIsoDate(upcomingDate),
        dateLabel: this.toRoDateLabel(upcomingDate),
        startTime: '16:00',
        endTime: '17:00',
        startMinutes: 16 * 60,
        endMinutes: 17 * 60,
        clientFirstName: 'Mihai',
        clientLastName: 'Ionescu',
        clientEmail: 'telefon@gangstyle.ro',
        clientPhone: '722 918 440',
        notes: 'Programare telefonică adăugată de Filip',
        source: 'PHONE',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'apt-demo-upcoming-2',
        barberSlug: 'filip',
        barberName: 'Filip',
        barberPhotoUrl: 'images/Filip.jpg',
        serviceId: 's-filip-1',
        serviceName: 'Tuns & Styling',
        durationMinutes: 45,
        slotMinutes: 60,
        priceRon: 60,
        dateIso: this.toIsoDate(upcomingDate2),
        dateLabel: this.toRoDateLabel(upcomingDate2),
        startTime: '11:00',
        endTime: '12:00',
        startMinutes: 11 * 60,
        endMinutes: 12 * 60,
        clientFirstName: 'Cristian',
        clientLastName: 'Dumitru',
        clientEmail: 'cristi@gmail.com',
        clientPhone: '731 550 812',
        source: 'ONLINE',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'apt-demo-upcoming-3',
        barberSlug: 'filip',
        barberName: 'Filip',
        barberPhotoUrl: 'images/Filip.jpg',
        serviceId: 's-filip-3',
        serviceName: 'Aranjat & Contur Barbă',
        durationMinutes: 30,
        slotMinutes: 30,
        priceRon: 40,
        dateIso: this.toIsoDate(upcomingDate2),
        dateLabel: this.toRoDateLabel(upcomingDate2),
        startTime: '13:00',
        endTime: '13:30',
        startMinutes: 13 * 60,
        endMinutes: 13 * 60 + 30,
        clientFirstName: 'Radu',
        clientLastName: 'Stanciu',
        clientEmail: 'radu@yahoo.com',
        clientPhone: '765 409 118',
        source: 'ONLINE',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'apt-demo-sebi-1',
        barberSlug: 'sebi',
        barberName: 'Sebi',
        barberPhotoUrl: 'images/Sebi.jpg',
        serviceId: 's-sebi-2',
        serviceName: 'Tuns + Barbă',
        durationMinutes: 60,
        slotMinutes: 60,
        priceRon: 90,
        dateIso: this.toIsoDate(upcomingDate),
        dateLabel: this.toRoDateLabel(upcomingDate),
        startTime: '12:00',
        endTime: '13:00',
        startMinutes: 12 * 60,
        endMinutes: 13 * 60,
        clientFirstName: 'Vlad',
        clientLastName: 'Georgescu',
        clientEmail: 'vlad@gmail.com',
        clientPhone: '745 112 309',
        notes: 'Low taper fade',
        source: 'ONLINE',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'apt-demo-past-1',
        barberSlug: 'sebi',
        barberName: 'Sebi',
        barberPhotoUrl: 'images/Sebi.jpg',
        serviceId: 's-sebi-1',
        serviceName: 'Tuns & Styling',
        durationMinutes: 45,
        slotMinutes: 60,
        priceRon: 60,
        dateIso: this.toIsoDate(pastDate),
        dateLabel: this.toRoDateLabel(pastDate),
        startTime: '11:00',
        endTime: '12:00',
        startMinutes: 11 * 60,
        endMinutes: 12 * 60,
        clientFirstName: 'Andrei',
        clientLastName: 'Popescu',
        clientEmail: 'demo@gangstyle.ro',
        clientPhone: '770 426 308',
        source: 'ONLINE',
        status: 'COMPLETED',
        createdAt: pastDate.toISOString(),
      },
    ];
  }

  private toIsoDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private toRoDateLabel(d: Date): string {
    const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
    const months = [
      'Ianuarie',
      'Februarie',
      'Martie',
      'Aprilie',
      'Mai',
      'Iunie',
      'Iulie',
      'August',
      'Septembrie',
      'Octombrie',
      'Noiembrie',
      'Decembrie',
    ];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }
}
