import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, catchError, of, tap, throwError, timeout } from 'rxjs';
import { NotificationService } from './notification.service';
import {
  AppointmentRecord,
  BarberBlockSummary,
  BarberDaySchedule,
  BarberScheduleConfig,
  BlacklistEntry,
  ServiceItem,
  TimeSlot,
} from '../../shared/models/service-item.model';

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
  private readonly servicesApiUrl = ServiceCatalogService.resolveApiUrl();
  private readonly storageKey = 'gangstyle_appointments_v3';

  private static resolveApiUrl(): string {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:8080/api/services`;
  }
  private readonly servicesStorageKey = 'gangstyle_services_v2';
  private readonly blacklistStorageKey = 'gangstyle_blacklist_v1';
  private readonly scheduleStorageKey = 'gangstyle_barber_schedules_v2';

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
    barberTarget: 'filip' | 'sebi' | 'both';
    name: string;
    durationMinutes: number;
    priceRon: number;
  }): Observable<ServiceItem[]> {
    const slotMinutes = Number(payload.durationMinutes);
    const targets: ('filip' | 'sebi')[] =
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

  // CRUD Create: Adds a new service package for Filip, Sebi, or both barbers
  addServicePackage(payload: {
    barberTarget: 'filip' | 'sebi' | 'both';
    name: string;
    durationMinutes: number;
    priceRon: number;
  }): ServiceItem[] {
    const all = this.getAllServices();
    const slotMinutes = Number(payload.durationMinutes);
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
  getEffectiveDayHours(
    barberSlug: string,
    dateIso: string
  ): { working: boolean; startTime: string; endTime: string } {
    const [yyyy, mm, dd] = dateIso.split('-').map(Number);
    if (!yyyy || !mm || !dd) {
      return { working: false, startTime: '10:00', endTime: '18:00' };
    }
    const dayOfWeek = new Date(yyyy, mm - 1, dd).getDay();
    const schedule = this.getBarberSchedule(barberSlug);

    if (schedule.mode === 'STANDARD') {
      const isSalonOpen = dayOfWeek >= 1 && dayOfWeek <= 5;
      return {
        working: isSalonOpen,
        startTime: '10:00',
        endTime: '18:00',
      };
    }

    const dayConfig = schedule.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!dayConfig || !dayConfig.working) {
      return { working: false, startTime: '10:00', endTime: '18:00' };
    }

    return {
      working: true,
      startTime: dayConfig.startTime || '10:00',
      endTime: dayConfig.endTime || '18:00',
    };
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

  // Creates and persists a full appointment record
  createAppointment(
    payload: Omit<AppointmentRecord, 'id' | 'startMinutes' | 'endMinutes' | 'status' | 'createdAt'>
  ): AppointmentRecord {
    const duration = Number(payload.durationMinutes) || Number(payload.slotMinutes) || 30;
    const startMinutes = this.parseMinutes(payload.startTime);
    const endMinutes = startMinutes + duration;

    const record: AppointmentRecord = {
      ...payload,
      slotMinutes: duration,
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
