import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, catchError, map, of, tap, throwError, timeout } from 'rxjs';
import { NotificationService } from './notification.service';
import {
  AppointmentApiRequestPayload,
  AppointmentRecord,
  AvailabilityApiResponse,
  BarberBlockSummary,
  BarberDaySchedule,
  BarberExtraAvailability,
  BarberScheduleConfig,
  BlacklistEntry,
  ServiceItem,
  TimeSlot,
} from '../../shared/models/service-item.model';

// Normalizes Romanian phone numbers to 10 digits starting with 0 (e.g. +40 770 426 308 -> 0770426308)
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('40') && digits.length === 11) {
    return '0' + digits.slice(2);
  }
  if (digits.length === 9 && !digits.startsWith('0')) {
    return '0' + digits;
  }
  return digits;
}

export interface ServicePackageApiPayload {
  barberSlug: string;
  name: string;
  durationMinutes: number;
  slotMinutes: number;
  priceRon: number;
}

// Manages service packages CRUD via REST API and local appointment helpers.
@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly servicesApiUrl = ServiceCatalogService.resolveBaseApiUrl('/api/services');
  private readonly availabilityApiUrl = ServiceCatalogService.resolveBaseApiUrl('/api/availability');
  private readonly appointmentsApiUrl = ServiceCatalogService.resolveBaseApiUrl('/api/appointments');
  private readonly storageKey = 'gangstyle_appointments_v3';

  private static resolveBaseApiUrl(path: string): string {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:8080${path}`;
  }
  private readonly servicesStorageKey = 'gangstyle_services_v2';
  private readonly blacklistStorageKey = 'gangstyle_blacklist_v1';
  private readonly scheduleStorageKey = 'gangstyle_barber_schedules_v2';
  private readonly extraAvailabilityStorageKey = 'gangstyle_barber_extra_availability_v1';

  private readonly defaultServices: ServiceItem[] = [
    // Filip packages
    {
      id: 's-filip-1',
      barberSlug: 'filip',
      name: 'Tuns',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 70,
    },
    {
      id: 's-filip-2',
      barberSlug: 'filip',
      name: 'Tuns + Aranjat Barbă + Spălat + Aranjat',
      durationMinutes: 45,
      slotMinutes: 45,
      priceRon: 90,
    },
    {
      id: 's-filip-3',
      barberSlug: 'filip',
      name: 'Aranjat Barba',
      durationMinutes: 15,
      slotMinutes: 15,
      priceRon: 30,
    },
    {
      id: 's-filip-4',
      barberSlug: 'filip',
      name: 'Spălat + Aranjat',
      durationMinutes: 10,
      slotMinutes: 10,
      priceRon: 25,
    },

    // Sebi packages
    {
      id: 's-sebi-1',
      barberSlug: 'sebi',
      name: 'Tuns',
      durationMinutes: 30,
      slotMinutes: 30,
      priceRon: 70,
    },
    {
      id: 's-sebi-2',
      barberSlug: 'sebi',
      name: 'Tuns + Aranjat Barbă + Spălat + Aranjat',
      durationMinutes: 45,
      slotMinutes: 45,
      priceRon: 90,
    },
    {
      id: 's-sebi-3',
      barberSlug: 'sebi',
      name: 'Aranjat Barba',
      durationMinutes: 15,
      slotMinutes: 15,
      priceRon: 30,
    },
    {
      id: 's-sebi-4',
      barberSlug: 'sebi',
      name: 'Spălat + Aranjat',
      durationMinutes: 10,
      slotMinutes: 10,
      priceRon: 25,
    },
  ];

  // Fetches all service packages from GET /api/services.
  fetchAllServices(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(this.servicesApiUrl).pipe(
      timeout(1500),
      tap((items) => this.saveServices(items)),
      catchError(() => of(this.getAllServices()))
    );
  }

  // Fetches service packages for a specific barber from GET /api/services?barber=slug.
  fetchServicesByBarber(barberSlug: string): Observable<ServiceItem[]> {
    return this.http
      .get<ServiceItem[]>(this.servicesApiUrl, {
        params: { barber: barberSlug.toLowerCase() },
      })
      .pipe(
        timeout(1500),
        catchError(() => of(this.getByBarberSlug(barberSlug)))
      );
  }

  // Creates a new service package via POST /api/services (protected by JWT).
  createServiceApi(payload: {
    barberTarget: string;
    name: string;
    durationMinutes: number;
    priceRon: number;
  }): Observable<ServiceItem[]> {
    const slotMinutes = Number(payload.durationMinutes);
    const targets: string[] =
      payload.barberTarget === 'both' ? ['filip', 'sebi'] : [payload.barberTarget];

    const requests = targets.map((slug) => {
      const body: ServicePackageApiPayload = {
        barberSlug: slug,
        name: payload.name.trim(),
        durationMinutes: Number(payload.durationMinutes),
        slotMinutes,
        priceRon: Number(payload.priceRon),
      };
      return this.http.post<ServiceItem>(this.servicesApiUrl, body);
    });

    return forkJoin(requests).pipe(
      catchError((err) => {
        if (err?.status === 0) {
          return of(this.addServicePackage(payload));
        }
        return throwError(() => err);
      })
    );
  }

  // Updates an existing service package via PUT /api/services/:id (protected by JWT).
  updateServiceApi(
    id: string,
    payload: {
      barberSlug: string;
      name: string;
      durationMinutes: number;
      priceRon: number;
    }
  ): Observable<ServiceItem> {
    const slotMinutes = Number(payload.durationMinutes);
    const body: ServicePackageApiPayload = {
      barberSlug: payload.barberSlug,
      name: payload.name.trim(),
      durationMinutes: Number(payload.durationMinutes),
      slotMinutes,
      priceRon: Number(payload.priceRon),
    };
    return this.http.put<ServiceItem>(`${this.servicesApiUrl}/${id}`, body).pipe(
      tap(() => {
        this.updateServicePackage(id, {
          name: payload.name,
          durationMinutes: payload.durationMinutes,
          priceRon: payload.priceRon,
        });
      }),
      catchError((err) => {
        if (err?.status === 0) {
          this.updateServicePackage(id, {
            name: payload.name,
            durationMinutes: payload.durationMinutes,
            priceRon: payload.priceRon,
          });
          return of({ id, ...body });
        }
        return throwError(() => err);
      })
    );
  }

  // Deletes a service package via DELETE /api/services/:id (protected by JWT).
  deleteServiceApi(id: string): Observable<void> {
    return this.http.delete<void>(`${this.servicesApiUrl}/${id}`).pipe(
      tap(() => this.deleteServicePackage(id)),
      catchError((err) => {
        if (err?.status === 0) {
          this.deleteServicePackage(id);
          return of(undefined);
        }
        return throwError(() => err);
      })
    );
  }

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

  // CRUD Create: Adds a new service package for a specific barber or all barbers
  addServicePackage(payload: {
    barberTarget: string;
    name: string;
    durationMinutes: number;
    priceRon: number;
  }): ServiceItem[] {
    const all = this.getAllServices();
    const slotMinutes = Number(payload.durationMinutes);
    const targets: string[] =
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
    target.slotMinutes = Number(changes.durationMinutes);
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
    const cleanPhone = normalizePhoneNumber(payload.clientPhone);
    const existing = list.find(
      (b) => normalizePhoneNumber(b.clientPhone) === cleanPhone
    );

    if (existing) {
      existing.noShowCount = Math.max(
        existing.noShowCount + 1,
        payload.noShowCount ?? 1
      );
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

  // Checks whether a client is blocked from online booking (2 or more no-shows or active blacklist)
  isClientBlocked(phone: string): {
    blocked: boolean;
    noShowCount: number;
    reason?: string;
  } {
    const clean = normalizePhoneNumber(phone);
    if (!clean || clean.length < 9) {
      return { blocked: false, noShowCount: 0 };
    }

    const blacklist = this.getBlacklist();
    const entry = blacklist.find(
      (b) => normalizePhoneNumber(b.clientPhone) === clean
    );

    const all = this.getAllAppointments();
    const noShowApts = all.filter(
      (a) =>
        normalizePhoneNumber(a.clientPhone) === clean &&
        a.status === 'NO_SHOW'
    );

    const totalNoShows = Math.max(entry?.noShowCount ?? 0, noShowApts.length);

    // If client has 2 or more no-shows, online booking is strictly blocked
    if ((entry && entry.noShowCount >= 2) || totalNoShows >= 2) {
      return {
        blocked: true,
        noShowCount: totalNoShows,
        reason:
          entry?.reason ||
          `${totalNoShows} neprezentări la programare fără anulare prealabilă`,
      };
    }

    return {
      blocked: false,
      noShowCount: totalNoShows,
    };
  }

  // Unblocks a client so they can book online again (called when they clarify the situation by phone)
  unblockClient(phoneOrId: string): boolean {
    const clean = normalizePhoneNumber(phoneOrId);
    let modified = false;

    // 1. Remove from blacklist storage
    const blacklist = this.getBlacklist();
    const filtered = blacklist.filter((b) => {
      const match =
        b.id === phoneOrId ||
        (clean.length >= 9 && normalizePhoneNumber(b.clientPhone) === clean);
      if (match) {
        modified = true;
      }
      return !match;
    });

    if (modified) {
      this.saveBlacklist(filtered);
    }

    // 2. Clear NO_SHOW status on past appointments for this client phone so penalty count is reset
    if (clean.length >= 9) {
      const all = this.getAllAppointments();
      let aptModified = false;
      for (const apt of all) {
        if (
          normalizePhoneNumber(apt.clientPhone) === clean &&
          apt.status === 'NO_SHOW'
        ) {
          apt.status = 'CANCELLED';
          apt.notes =
            (apt.notes ? apt.notes + ' | ' : '') + 'Deblocat telefonic de salon';
          aptModified = true;
          modified = true;
        }
      }
      if (aptModified) {
        this.saveAppointments(all);
      }
    }

    return modified;
  }

  removeFromBlacklist(id: string): boolean {
    return this.unblockClient(id);
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

  // Returns the default weekly template (Monday - Friday 10:00 - 18:00, Saturday & Sunday closed).
  getDefaultDaysSchedule(): BarberDaySchedule[] {
    return [
      { dayOfWeek: 1, dayName: 'Luni', working: true, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 2, dayName: 'Marți', working: true, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 3, dayName: 'Miercuri', working: true, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 4, dayName: 'Joi', working: true, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 5, dayName: 'Vineri', working: true, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 6, dayName: 'Sâmbătă', working: false, startTime: '10:00', endTime: '18:00' },
      { dayOfWeek: 0, dayName: 'Duminică', working: false, startTime: '10:00', endTime: '18:00' },
    ];
  }

  // Retrieves the active schedule configuration (STANDARD or CUSTOM) for a barber.
  getBarberSchedule(barberSlug: string): BarberScheduleConfig {
    const clean = barberSlug.trim().toLowerCase();
    const all = this.getAllBarberSchedules();
    const found = all[clean];
    if (found && Array.isArray(found.days) && found.days.length === 7) {
      return found;
    }
    return {
      barberSlug: clean,
      mode: 'STANDARD',
      days: this.getDefaultDaysSchedule(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Persists a barber's schedule mode and custom weekly hours.
  saveBarberSchedule(config: BarberScheduleConfig): BarberScheduleConfig {
    const clean = config.barberSlug.trim().toLowerCase();
    const all = this.getAllBarberSchedules();
    const updated: BarberScheduleConfig = {
      barberSlug: clean,
      mode: config.mode,
      days: config.days.map((d) => ({ ...d })),
      updatedAt: new Date().toISOString(),
    };
    all[clean] = updated;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.scheduleStorageKey, JSON.stringify(all));
    }
    return updated;
  }

  // Resolves effective working status and hours for a barber on a given YYYY-MM-DD date.
  // Merges the recurring schedule (Standard or Custom) with any date-specific extra availability overrides.
  getEffectiveDayHours(
    barberSlug: string,
    dateIso: string
  ): { working: boolean; startTime: string; endTime: string } {
    const [yyyy, mm, dd] = dateIso.split('-').map(Number);
    if (!yyyy || !mm || !dd) {
      return { working: false, startTime: '10:00', endTime: '18:00' };
    }
    const cleanSlug = barberSlug.trim().toLowerCase();
    const dayOfWeek = new Date(yyyy, mm - 1, dd).getDay();
    const schedule = this.getBarberSchedule(cleanSlug);

    let baseWorking = false;
    let baseStart = '10:00';
    let baseEnd = '18:00';

    if (schedule.mode === 'STANDARD') {
      baseWorking = dayOfWeek >= 1 && dayOfWeek <= 5;
    } else {
      const dayConfig = schedule.days.find((d) => d.dayOfWeek === dayOfWeek);
      if (dayConfig && dayConfig.working) {
        baseWorking = true;
        baseStart = dayConfig.startTime || '10:00';
        baseEnd = dayConfig.endTime || '18:00';
      }
    }

    // Check if the barber added a one-off extra working day or extended hours for this specific date
    const extraForDate = this.getAllExtraAvailabilities().filter(
      (e) => e.barberSlug === cleanSlug && e.dateIso === dateIso
    );

    if (extraForDate.length === 0) {
      return {
        working: baseWorking,
        startTime: baseStart,
        endTime: baseEnd,
      };
    }

    // Combine recurring hours (if working day) with extra availability intervals
    let minStartMin = baseWorking ? this.parseMinutes(baseStart) : 24 * 60;
    let maxEndMin = baseWorking ? this.parseMinutes(baseEnd) : 0;

    for (const extra of extraForDate) {
      const eStart = this.parseMinutes(extra.startTime);
      const eEnd = this.parseMinutes(extra.endTime);
      if (eStart < eEnd) {
        minStartMin = Math.min(minStartMin, eStart);
        maxEndMin = Math.max(maxEndMin, eEnd);
      }
    }

    if (minStartMin >= maxEndMin) {
      return { working: baseWorking, startTime: baseStart, endTime: baseEnd };
    }

    return {
      working: true,
      startTime: this.formatMinutes(minStartMin),
      endTime: this.formatMinutes(maxEndMin),
    };
  }

  // Adds a date-specific extra working day or extended shift without changing the recurring schedule.
  addExtraAvailability(params: {
    barberSlug: string;
    dateIso: string;
    dateLabel: string;
    startTime: string;
    endTime: string;
    note: string;
  }): BarberExtraAvailability {
    const cleanSlug = params.barberSlug.trim().toLowerCase();
    const all = this.getAllExtraAvailabilities().filter(
      (e) => !(e.barberSlug === cleanSlug && e.dateIso === params.dateIso)
    );

    const record: BarberExtraAvailability = {
      id: 'ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      barberSlug: cleanSlug,
      dateIso: params.dateIso,
      dateLabel: params.dateLabel,
      startTime: params.startTime,
      endTime: params.endTime,
      note: params.note.trim() || 'Program suplimentar',
      createdAt: new Date().toISOString(),
    };

    all.push(record);
    this.saveExtraAvailabilities(all);
    return record;
  }

  // Returns active extra working days/hours for a barber from today onwards.
  getExtraAvailabilityForBarber(barberSlug: string): BarberExtraAvailability[] {
    const clean = barberSlug.trim().toLowerCase();
    const todayIso = this.toIsoDate(new Date());
    return this.getAllExtraAvailabilities()
      .filter((e) => e.barberSlug === clean && e.dateIso >= todayIso)
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }

  // Removes a previously added extra working day or interval.
  removeExtraAvailability(id: string): boolean {
    const all = this.getAllExtraAvailabilities();
    const filtered = all.filter((e) => e.id !== id);
    if (filtered.length === all.length) {
      return false;
    }
    this.saveExtraAvailabilities(filtered);
    return true;
  }

  private getAllExtraAvailabilities(): BarberExtraAvailability[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(this.extraAvailabilityStorageKey);
      return raw ? (JSON.parse(raw) as BarberExtraAvailability[]) : [];
    } catch {
      return [];
    }
  }

  private saveExtraAvailabilities(list: BarberExtraAvailability[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.extraAvailabilityStorageKey, JSON.stringify(list));
    }
  }

  // Checks if a specific date is available for booking (barber works that day and is not on full-day leave/vacation).
  isDateAvailableForBarber(barberSlug: string, dateIso: string): boolean {
    const clean = barberSlug.trim().toLowerCase();
    const hours = this.getEffectiveDayHours(clean, dateIso);
    if (!hours.working) {
      return false;
    }

    const openMinutes = this.parseMinutes(hours.startTime);
    const closeMinutes = this.parseMinutes(hours.endTime);
    if (openMinutes >= closeMinutes) {
      return false;
    }

    const occupied = this.getOccupiedForDay(clean, dateIso);
    const hasFullDayBlock = occupied.some(
      (b) =>
        b.source === 'BLOCKED' &&
        (b.blockType === 'FULL_DAY' ||
          b.blockType === 'VACATION' ||
          (b.startMinutes <= openMinutes && b.endMinutes >= closeMinutes))
    );

    return !hasFullDayBlock;
  }

  private getAllBarberSchedules(): Record<string, BarberScheduleConfig> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }
    try {
      const raw = window.localStorage.getItem(this.scheduleStorageKey);
      return raw ? (JSON.parse(raw) as Record<string, BarberScheduleConfig>) : {};
    } catch {
      return {};
    }
  }

  // Builds daily slots dynamically based on the barber's active schedule, blocked intervals, and existing client appointments.
  getSlotsForDate(barberSlug: string, dateIso: string, service: ServiceItem): TimeSlot[] {
    const cleanSlug = barberSlug.trim().toLowerCase();
    const dayHours = this.getEffectiveDayHours(cleanSlug, dateIso);
    if (!dayHours.working) {
      return [];
    }

    const openMinutes = this.parseMinutes(dayHours.startTime);
    const closeMinutes = this.parseMinutes(dayHours.endTime);
    if (openMinutes >= closeMinutes) {
      return [];
    }

    const duration = Math.max(
      10,
      Number(service.durationMinutes) || Number(service.slotMinutes) || 30
    );
    const occupied = this.getOccupiedForDay(cleanSlug, dateIso).sort(
      (a, b) => a.startMinutes - b.startMinutes
    );

    // If the day is covered by a full-day off or vacation block, no slots are generated.
    const isFullDayBlocked = occupied.some(
      (b) =>
        b.source === 'BLOCKED' &&
        (b.blockType === 'FULL_DAY' ||
          b.blockType === 'VACATION' ||
          (b.startMinutes <= openMinutes && b.endMinutes >= closeMinutes))
    );
    if (isFullDayBlocked) {
      return [];
    }

    const slots: TimeSlot[] = [];
    const emittedOccupiedIds = new Set<string>();
    let cursor = openMinutes;

    // Pack slots dynamically so the next available slot starts immediately after any appointment or break ends.
    while (cursor + duration <= closeMinutes) {
      const end = cursor + duration;
      const overlapping = occupied.find(
        (b) => cursor < b.endMinutes && end > b.startMinutes
      );

      if (overlapping) {
        // Show existing client appointments as occupied slots, while hiding personal breaks/blocks completely.
        if (
          overlapping.source !== 'BLOCKED' &&
          !emittedOccupiedIds.has(overlapping.id) &&
          overlapping.startMinutes >= openMinutes &&
          overlapping.endMinutes <= closeMinutes
        ) {
          emittedOccupiedIds.add(overlapping.id);
          slots.push({
            startTime: overlapping.startTime,
            endTime: overlapping.endTime,
            label: `${overlapping.startTime} - ${overlapping.endTime}`,
            available: false,
          });
        }
        cursor = Math.max(cursor + 5, overlapping.endMinutes);
        continue;
      }

      const startTime = this.formatMinutes(cursor);
      const endTime = this.formatMinutes(end);
      slots.push({
        startTime,
        endTime,
        label: `${startTime} - ${endTime}`,
        available: true,
      });

      cursor = end;
    }

    // Exclude past slots and apply 5-minute lead-time buffer for today.
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (dateIso === todayIso) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const cutoffMinutes = currentMinutes + 5;
      return slots.filter((slot) => this.parseMinutes(slot.startTime) >= cutoffMinutes);
    }

    return slots;
  }

  /**
   * Fetches real daily availability slots from GET /api/availability on the Spring Boot backend.
   * Sends the barber's effective working hours and selected service duration, and cross-checks
   * the returned slots against any local-only barber breaks or blocks so both sources stay synchronized.
   * Falls back to local calculation only if the backend server is completely unreachable (status 0 / timeout),
   * while propagating explicit HTTP errors (400, 404, 500) to the component error handler.
   */
  fetchAvailabilitySlotsApi(
    barberSlug: string,
    dateIso: string,
    service: ServiceItem
  ): Observable<TimeSlot[]> {
    const cleanSlug = barberSlug.trim().toLowerCase();
    const dayHours = this.getEffectiveDayHours(cleanSlug, dateIso);
    if (!dayHours.working) {
      return of([]);
    }

    const openMinutes = this.parseMinutes(dayHours.startTime);
    const closeMinutes = this.parseMinutes(dayHours.endTime);
    if (openMinutes >= closeMinutes) {
      return of([]);
    }

    // Check if the barber blocked the entire day or set a vacation locally
    const localOccupied = this.getOccupiedForDay(cleanSlug, dateIso);
    const isFullDayBlocked = localOccupied.some(
      (b) =>
        b.source === 'BLOCKED' &&
        (b.blockType === 'FULL_DAY' ||
          b.blockType === 'VACATION' ||
          (b.startMinutes <= openMinutes && b.endMinutes >= closeMinutes))
    );
    if (isFullDayBlocked) {
      return of([]);
    }

    const duration = Math.max(
      10,
      Number(service.durationMinutes) || Number(service.slotMinutes) || 30
    );

    return this.http
      .get<AvailabilityApiResponse>(this.availabilityApiUrl, {
        params: {
          barber: cleanSlug,
          date: dateIso,
          serviceId: service.id,
          durationMinutes: String(duration),
          startTime: dayHours.startTime,
          endTime: dayHours.endTime,
        },
      })
      .pipe(
        timeout(2000),
        map((response) => {
          if (!response || !response.workingDay || !Array.isArray(response.slots)) {
            return [];
          }
          const backendSlots: TimeSlot[] = response.slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label || `${slot.startTime} - ${slot.endTime}`,
            durationMinutes: slot.durationMinutes ?? duration,
            available: Boolean(slot.available),
          }));
          return this.mergeBackendSlotsWithLocalObstacles(cleanSlug, dateIso, backendSlots);
        }),
        catchError((err) => {
          // Only fallback to local calculation when backend is offline/unreachable; propagate HTTP errors
          if (err?.status === 0 || err?.name === 'TimeoutError') {
            return of(this.getSlotsForDate(barberSlug, dateIso, service));
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * Reconciles slots returned by GET /api/availability with any locally stored appointments
   * or personal barber breaks so that local blocks hide slots and local client appointments mark slots occupied.
   */
  private mergeBackendSlotsWithLocalObstacles(
    barberSlug: string,
    dateIso: string,
    backendSlots: TimeSlot[]
  ): TimeSlot[] {
    const localOccupied = this.getOccupiedForDay(barberSlug, dateIso);
    if (localOccupied.length === 0) {
      return backendSlots;
    }

    const reconciled: TimeSlot[] = [];
    for (const slot of backendSlots) {
      const slotStart = this.parseMinutes(slot.startTime);
      const slotEnd = this.parseMinutes(slot.endTime);

      const overlappingLocal = localOccupied.find(
        (obs) => slotStart < obs.endMinutes && slotEnd > obs.startMinutes
      );

      if (!overlappingLocal) {
        reconciled.push(slot);
      } else if (overlappingLocal.source === 'BLOCKED') {
        // Personal barber breaks remain hidden from the public client view
        continue;
      } else {
        // Mark slot as occupied if overlapped by an active client booking
        reconciled.push({
          ...slot,
          available: false,
        });
      }
    }

    return reconciled;
  }

  /**
   * Submits a new appointment booking to POST /api/appointments on the Spring Boot backend.
   * Synchronizes the confirmed appointment with local storage and dispatches real-time barber notifications.
   * Propagates HTTP errors (400 Bad Request, 409 Conflict race condition, 429, 500) directly to the caller
   * so Angular's ErrorHandlerService can display actionable feedback.
   */
  createAppointmentApi(
    payload: Omit<AppointmentRecord, 'id' | 'startMinutes' | 'endMinutes' | 'status' | 'createdAt'>
  ): Observable<AppointmentRecord> {
    const bookingSource = payload.source ?? 'ONLINE';

    // Immediate client-side check against local anti-no-show blacklist
    if (bookingSource === 'ONLINE') {
      const blockCheck = this.isClientBlocked(payload.clientPhone);
      if (blockCheck.blocked) {
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              statusText: 'Bad Request',
              error: {
                message:
                  'Te rugăm să contactezi direct salonul la nr 0770426308 pentru o nouă programare.',
              },
            })
        );
      }
    }

    const duration = Number(payload.durationMinutes) || Number(payload.slotMinutes) || 30;
    const requestBody: AppointmentApiRequestPayload = {
      barberSlug: payload.barberSlug.trim().toLowerCase(),
      serviceId: payload.serviceId,
      serviceName: payload.serviceName,
      durationMinutes: duration,
      priceRon: Number(payload.priceRon),
      dateIso: payload.dateIso,
      dateLabel: payload.dateLabel,
      startTime: payload.startTime,
      clientFirstName: payload.clientFirstName.trim(),
      clientLastName: payload.clientLastName.trim(),
      clientEmail: payload.clientEmail.trim().toLowerCase(),
      clientPhone: payload.clientPhone.trim(),
      notes: payload.notes?.trim() || undefined,
      source: bookingSource,
    };

    return this.http.post<any>(this.appointmentsApiUrl, requestBody).pipe(
      timeout(3000),
      map((apiRes) => {
        const record = this.mapApiResponseToAppointmentRecord(apiRes, payload);
        this.upsertLocalAppointment(record);
        this.notificationService.broadcastNewAppointment(record);
        return record;
      }),
      catchError((err) => {
        // Fallback to local persistence only when backend server is completely unreachable
        if (err?.status === 0 || err?.name === 'TimeoutError') {
          try {
            const localCreated = this.createAppointment(payload);
            return of(localCreated);
          } catch (localErr) {
            return throwError(() => localErr);
          }
        }
        // Re-throw all HTTP status errors (400, 403, 404, 409 Conflict, 429, 500) for UI handling
        return throwError(() => err);
      })
    );
  }

  /**
   * Maps a backend AppointmentResponseDto JSON payload into the frontend AppointmentRecord model.
   */
  private mapApiResponseToAppointmentRecord(
    apiRes: any,
    fallbackPayload: Omit<
      AppointmentRecord,
      'id' | 'startMinutes' | 'endMinutes' | 'status' | 'createdAt'
    >
  ): AppointmentRecord {
    const duration =
      Number(apiRes?.durationMinutes) ||
      Number(fallbackPayload.durationMinutes) ||
      Number(fallbackPayload.slotMinutes) ||
      30;
    const startTime = apiRes?.startTime || fallbackPayload.startTime;
    const startMinutes =
      typeof apiRes?.startMinutes === 'number'
        ? apiRes.startMinutes
        : this.parseMinutes(startTime);
    const endMinutes =
      typeof apiRes?.endMinutes === 'number' ? apiRes.endMinutes : startMinutes + duration;

    return {
      id: apiRes?.id || 'apt-' + Date.now(),
      barberSlug: (apiRes?.barberSlug || fallbackPayload.barberSlug).toLowerCase(),
      barberName: apiRes?.barberName || fallbackPayload.barberName,
      barberPhotoUrl: apiRes?.barberPhotoUrl || fallbackPayload.barberPhotoUrl,
      serviceId: apiRes?.serviceId || fallbackPayload.serviceId,
      serviceName: apiRes?.serviceName || fallbackPayload.serviceName,
      durationMinutes: duration,
      slotMinutes: Number(apiRes?.slotMinutes) || duration,
      priceRon: Number(apiRes?.priceRon ?? fallbackPayload.priceRon),
      dateIso: apiRes?.dateIso || fallbackPayload.dateIso,
      dateLabel: apiRes?.dateLabel || fallbackPayload.dateLabel,
      startTime,
      endTime: apiRes?.endTime || this.formatMinutes(endMinutes),
      startMinutes,
      endMinutes,
      clientFirstName: apiRes?.clientFirstName || fallbackPayload.clientFirstName,
      clientLastName: apiRes?.clientLastName || fallbackPayload.clientLastName,
      clientEmail: (apiRes?.clientEmail || fallbackPayload.clientEmail || '').trim().toLowerCase(),
      clientPhone: apiRes?.clientPhone || fallbackPayload.clientPhone,
      notes: apiRes?.notes || fallbackPayload.notes,
      source: apiRes?.source || fallbackPayload.source || 'ONLINE',
      status: apiRes?.status || 'CONFIRMED',
      createdAt:
        typeof apiRes?.createdAt === 'string' ? apiRes.createdAt : new Date().toISOString(),
    };
  }

  /**
   * Inserts or updates an appointment record in localStorage so client and barber portals remain synced.
   */
  private upsertLocalAppointment(record: AppointmentRecord): void {
    const all = this.getAllAppointments();
    const existingIdx = all.findIndex((a) => a.id === record.id);
    if (existingIdx >= 0) {
      all[existingIdx] = record;
    } else {
      all.unshift(record);
    }
    this.saveAppointments(all);
  }

  // Creates and persists a full appointment record locally (used by staff modals and offline fallback)
  createAppointment(
    payload: Omit<AppointmentRecord, 'id' | 'startMinutes' | 'endMinutes' | 'status' | 'createdAt'>
  ): AppointmentRecord {
    const bookingSource = payload.source ?? 'ONLINE';

    // Enforce 14-day rolling booking horizon (2 weeks) and anti-no-show blacklist shield for online client bookings
    if (bookingSource === 'ONLINE') {
      const blockCheck = this.isClientBlocked(payload.clientPhone);
      if (blockCheck.blocked) {
        throw new HttpErrorResponse({
          status: 400,
          statusText: 'Bad Request',
          error: {
            message:
              'Te rugăm să contactezi direct salonul la nr 0770426308 pentru o nouă programare.',
          },
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 14);
      maxDate.setHours(23, 59, 59, 999);

      const [targetYear, targetMonth, targetDay] = payload.dateIso.split('-').map(Number);
      const targetDate = new Date(targetYear, targetMonth - 1, targetDay, 12, 0, 0, 0);

      if (targetDate < today || targetDate > maxDate) {
        throw new HttpErrorResponse({
          status: 400,
          statusText: 'Bad Request',
          error: {
            message:
              'Programările online sunt permise doar în intervalul de maximum 14 zile (2 săptămâni).',
          },
        });
      }
    }

    const duration = Number(payload.durationMinutes) || Number(payload.slotMinutes) || 30;
    const startMinutes = this.parseMinutes(payload.startTime);
    const endMinutes = startMinutes + duration;

    // Anti-overlap check for online bookings: throw 409 Conflict if the interval is already occupied
    if (bookingSource === 'ONLINE') {
      const occupied = this.getOccupiedForDay(payload.barberSlug, payload.dateIso);
      const conflict = occupied.find(
        (existing) => startMinutes < existing.endMinutes && endMinutes > existing.startMinutes
      );
      if (conflict) {
        throw new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: {
            message: `Intervalul orar ${payload.startTime} - ${this.formatMinutes(endMinutes)} este deja ocupat. Te rugăm să alegi o altă oră disponibilă.`,
          },
        });
      }
    }

    const record: AppointmentRecord = {
      ...payload,
      slotMinutes: duration,
      id: 'apt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      barberSlug: payload.barberSlug.toLowerCase(),
      clientEmail: payload.clientEmail.trim().toLowerCase(),
      source: bookingSource,
      startMinutes,
      endMinutes,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const all = this.getAllAppointments();
    all.unshift(record);
    this.saveAppointments(all);
    this.notificationService.broadcastNewAppointment(record);

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
    blockType?: 'INTERVAL' | 'FULL_DAY' | 'VACATION';
    vacationGroupId?: string;
    endDateIso?: string;
    endDateLabel?: string;
  }): AppointmentRecord {
    const startMinutes = this.parseMinutes(params.startTime);
    const endMinutes = this.parseMinutes(params.endTime);
    const durationMinutes = Math.max(15, endMinutes - startMinutes);

    const record: AppointmentRecord = {
      id: 'blk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      barberSlug: params.barberSlug.toLowerCase(),
      barberName: params.barberName,
      barberPhotoUrl: params.barberPhotoUrl,
      serviceId: 'blocked',
      serviceName: params.reason || 'Interval Blocat / Pauză',
      durationMinutes,
      slotMinutes: durationMinutes,
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
      blockType: params.blockType ?? 'INTERVAL',
      vacationGroupId: params.vacationGroupId,
      endDateIso: params.endDateIso,
      endDateLabel: params.endDateLabel,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const all = this.getAllAppointments();
    all.unshift(record);
    this.saveAppointments(all);
    return record;
  }

  // Blocks a multi-day vacation range [startDateIso, endDateIso] inclusive for a barber.
  blockVacationRange(params: {
    barberSlug: string;
    barberName: string;
    barberPhotoUrl: string;
    startDateIso: string;
    endDateIso: string;
    reason: string;
  }): AppointmentRecord[] {
    const [sY, sM, sD] = params.startDateIso.split('-').map(Number);
    const [eY, eM, eD] = params.endDateIso.split('-').map(Number);
    if (!sY || !sM || !sD || !eY || !eM || !eD) {
      return [];
    }

    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);
    if (start.getTime() > end.getTime()) {
      return [];
    }

    const groupId = 'vac-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const startLabel = this.toRoDateLabel(start);
    const endLabel = this.toRoDateLabel(end);
    const created: AppointmentRecord[] = [];
    const cursor = new Date(start);

    // Cap range iteration at 60 days for safety.
    let safety = 0;
    while (cursor.getTime() <= end.getTime() && safety < 60) {
      const iso = this.toIsoDate(cursor);
      const label = this.toRoDateLabel(cursor);
      const rec = this.blockTimeInterval({
        barberSlug: params.barberSlug,
        barberName: params.barberName,
        barberPhotoUrl: params.barberPhotoUrl,
        dateIso: iso,
        dateLabel: label,
        startTime: '00:00',
        endTime: '23:59',
        reason: params.reason || 'Concediu',
        blockType: 'VACATION',
        vacationGroupId: groupId,
        endDateIso: params.endDateIso,
        endDateLabel: `${startLabel} – ${endLabel}`,
      });
      created.push(rec);
      cursor.setDate(cursor.getDate() + 1);
      safety++;
    }

    return created;
  }

  // Returns active breaks, days off, and grouped vacations for a barber.
  getActiveBlocksForBarber(barberSlug: string): BarberBlockSummary[] {
    const clean = barberSlug.trim().toLowerCase();
    const rawBlocks = this.getAllAppointments().filter(
      (a) => a.barberSlug === clean && a.source === 'BLOCKED' && a.status === 'CONFIRMED'
    );

    const summaries: BarberBlockSummary[] = [];
    const seenVacationGroups = new Set<string>();

    for (const blk of rawBlocks) {
      if (blk.blockType === 'VACATION' && blk.vacationGroupId) {
        if (seenVacationGroups.has(blk.vacationGroupId)) {
          continue;
        }
        seenVacationGroups.add(blk.vacationGroupId);
        const groupRecords = rawBlocks
          .filter((r) => r.vacationGroupId === blk.vacationGroupId)
          .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
        const first = groupRecords[0] ?? blk;
        const last = groupRecords[groupRecords.length - 1] ?? blk;

        summaries.push({
          id: blk.vacationGroupId,
          barberSlug: clean,
          blockType: 'VACATION',
          dateIso: first.dateIso,
          endDateIso: last.dateIso,
          label:
            first.dateIso === last.dateIso
              ? first.dateLabel
              : `${first.dateLabel} – ${last.dateLabel}`,
          timeLabel: `Concediu (${groupRecords.length} ${groupRecords.length === 1 ? 'zi' : 'zile'})`,
          reason: blk.notes || blk.serviceName || 'Concediu',
        });
      } else {
        const isFullDay =
          blk.blockType === 'FULL_DAY' ||
          (blk.startMinutes <= 10 * 60 && blk.endMinutes >= 19 * 60);
        summaries.push({
          id: blk.id,
          barberSlug: clean,
          blockType: isFullDay ? 'FULL_DAY' : 'INTERVAL',
          dateIso: blk.dateIso,
          label: blk.dateLabel,
          timeLabel: isFullDay ? 'Toată ziua liberă' : `${blk.startTime} - ${blk.endTime}`,
          reason: blk.notes || blk.serviceName || 'Indisponibil',
        });
      }
    }

    return summaries.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }

  // Removes a blocked interval, full day off, or entire vacation range by ID.
  removeBarberBlock(idOrGroupId: string): boolean {
    const all = this.getAllAppointments();
    let changed = false;
    for (const apt of all) {
      if (
        apt.source === 'BLOCKED' &&
        apt.status === 'CONFIRMED' &&
        (apt.id === idOrGroupId || apt.vacationGroupId === idOrGroupId)
      ) {
        apt.status = 'CANCELLED';
        changed = true;
      }
    }
    if (changed) {
      this.saveAppointments(all);
    }
    return changed;
  }

  // Returns appointments strictly for the authenticated client (by verified email or phone)
  getAppointmentsByEmail(email: string, phone?: string): AppointmentRecord[] {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? normalizePhoneNumber(phone) : '';
    if (!cleanEmail && !cleanPhone) {
      return [];
    }
    const all = this.getAllAppointments().filter((a) => a.source !== 'BLOCKED');
    return all.filter((a) => {
      const matchEmail = cleanEmail.length > 0 && a.clientEmail?.trim().toLowerCase() === cleanEmail;
      const matchPhone = cleanPhone.length >= 9 && normalizePhoneNumber(a.clientPhone) === cleanPhone;
      return matchEmail || matchPhone;
    });
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

  // Updates an existing appointment's date, time, service, and notes (rescheduling from barber dashboard).
  updateAppointment(
    appointmentId: string,
    changes: {
      dateIso: string;
      dateLabel: string;
      startTime: string;
      serviceId?: string;
      serviceName?: string;
      durationMinutes?: number;
      priceRon?: number;
      notes?: string;
    }
  ): AppointmentRecord | null {
    const all = this.getAllAppointments();
    const target = all.find((a) => a.id === appointmentId);
    if (!target) {
      return null;
    }

    if (changes.serviceName && changes.durationMinutes && changes.priceRon !== undefined) {
      if (changes.serviceId) {
        target.serviceId = changes.serviceId;
      }
      target.serviceName = changes.serviceName;
      target.durationMinutes = changes.durationMinutes;
      target.slotMinutes = changes.durationMinutes;
      target.priceRon = changes.priceRon;
    } else if (changes.serviceId && changes.serviceId !== target.serviceId) {
      const foundSrv = this.getAllServices().find((s: ServiceItem) => s.id === changes.serviceId);
      if (foundSrv) {
        target.serviceId = foundSrv.id;
        target.serviceName = foundSrv.name;
        target.durationMinutes = foundSrv.durationMinutes;
        target.slotMinutes = foundSrv.durationMinutes;
        target.priceRon = foundSrv.priceRon;
      }
    }

    const duration = Number(target.durationMinutes) || Number(target.slotMinutes) || 30;
    const startMinutes = this.parseMinutes(changes.startTime);
    const endMinutes = startMinutes + duration;

    target.dateIso = changes.dateIso;
    target.dateLabel = changes.dateLabel;
    target.startTime = changes.startTime;
    target.endTime = this.formatMinutes(endMinutes);
    target.startMinutes = startMinutes;
    target.endMinutes = endMinutes;
    if (changes.notes !== undefined) {
      target.notes = changes.notes.trim();
    }

    this.saveAppointments(all);
    return target;
  }

  // Detects active client appointments that overlap with a proposed time block, full day off, or vacation range.
  findConflictingAppointmentsForBlock(params: {
    barberSlug: string;
    blockType: 'INTERVAL' | 'FULL_DAY' | 'VACATION';
    dateIso: string;
    endDateIso?: string;
    startTime: string;
    endTime: string;
  }): AppointmentRecord[] {
    const cleanSlug = params.barberSlug.trim().toLowerCase();
    const activeClientAppointments = this.getAllAppointments().filter(
      (a) =>
        a.barberSlug === cleanSlug &&
        a.status === 'CONFIRMED' &&
        a.source !== 'BLOCKED'
    );

    if (params.blockType === 'VACATION') {
      const endIso = params.endDateIso || params.dateIso;
      return activeClientAppointments
        .filter((a) => a.dateIso >= params.dateIso && a.dateIso <= endIso)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.startMinutes - b.startMinutes);
    }

    if (params.blockType === 'FULL_DAY') {
      return activeClientAppointments
        .filter((a) => a.dateIso === params.dateIso)
        .sort((a, b) => a.startMinutes - b.startMinutes);
    }

    const blockStart = this.parseMinutes(params.startTime);
    const blockEnd = this.parseMinutes(params.endTime);

    return activeClientAppointments
      .filter(
        (a) =>
          a.dateIso === params.dateIso &&
          a.startMinutes < blockEnd &&
          a.endMinutes > blockStart
      )
      .sort((a, b) => a.startMinutes - b.startMinutes);
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
        barberPhotoUrl: '/images/Filip.jpg',
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
        barberPhotoUrl: '/images/Filip.jpg',
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
        barberPhotoUrl: '/images/Filip.jpg',
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
        barberPhotoUrl: '/images/Filip.jpg',
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
        barberPhotoUrl: '/images/Sebi.jpg',
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
        barberPhotoUrl: '/images/Sebi.jpg',
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
