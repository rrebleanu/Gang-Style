import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BarberService } from '../../core/services/barber.service';
import { NotificationService } from '../../core/services/notification.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { TwoFactorModal } from '../../shared/components/two-factor-modal/two-factor-modal';
import { Barber } from '../../shared/models/barber.model';
import {
  AppointmentRecord,
  BarberBlockSummary,
  BarberDaySchedule,
  BarberExtraAvailability,
  BarberScheduleConfig,
  BlacklistEntry,
  ServiceItem,
  TimeSlot,
} from '../../shared/models/service-item.model';

export type PortalFilterTab = 'UPCOMING' | 'HISTORY' | 'ALL';
export type DashboardViewMode = 'CLIENT' | 'BARBER';
export type BarberTimeFilter = 'TODAY' | 'TOMORROW' | 'MONTH' | 'ALL';

export interface WorkingDayOption {
  iso: string;
  shortLabel: string;
  fullLabel: string;
}

// Unified Dashboard (/dashboard):
// 1. Client Account Panel (upcoming/past bookings, 3h cancel rule, 1-click reschedule)
// 2. Barber Dashboard for Filip & Sebi (table with day filter & search, add phone booking, block interval/day off, status actions)
@Component({
  selector: 'app-portal',
  imports: [RouterLink, ReactiveFormsModule, TwoFactorModal],
  templateUrl: './portal.html',
  styleUrl: './portal.scss',
  host: {
    '(document:keydown.escape)': 'closeAllModals()',
  },
})
export class Portal implements OnInit {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(ServiceCatalogService);
  private readonly barberService = inject(BarberService);
  readonly notificationService = inject(NotificationService);
  readonly authService = inject(AuthService);

  constructor() {
    // Automatically re-sync appointment data when a new booking notification arrives
    effect(() => {
      const toast = this.notificationService.activeToast();
      if (toast && toast.barberSlug === this.selectedBarberSlug()) {
        this.refreshAllData();
      }
    });
  }

  // Active dashboard view mode: 'CLIENT' or 'BARBER'
  readonly viewMode = signal<DashboardViewMode>('CLIENT');

  // Shared feedback banner message
  readonly feedbackMessage = signal<string | null>(null);
  readonly twoFactorModalOpen = signal(false);

  // Client dashboard state and computed signals
  readonly appointments = signal<AppointmentRecord[]>([]);
  readonly activeTab = signal<PortalFilterTab>('UPCOMING');
  readonly appointmentToCancel = signal<AppointmentRecord | null>(null);
  readonly appointmentToDelete = signal<AppointmentRecord | null>(null);

  readonly upcomingAppointments = computed<AppointmentRecord[]>(() =>
    this.appointments()
      .filter((apt) => apt.status === 'CONFIRMED' && !this.isPast(apt))
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.startMinutes - b.startMinutes)
  );

  readonly historyAppointments = computed<AppointmentRecord[]>(() =>
    this.appointments()
      .filter((apt) => apt.status !== 'CONFIRMED' || this.isPast(apt))
      .sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.startMinutes - a.startMinutes)
  );

  readonly visibleAppointments = computed<AppointmentRecord[]>(() => {
    const tab = this.activeTab();
    if (tab === 'UPCOMING') {
      return this.upcomingAppointments();
    }
    if (tab === 'HISTORY') {
      return this.historyAppointments();
    }
    return this.appointments();
  });

  readonly completedCount = computed<number>(
    () =>
      this.appointments().filter(
        (apt) => apt.status === 'COMPLETED' || (apt.status === 'CONFIRMED' && this.isPast(apt))
      ).length
  );

  readonly favoriteBarber = computed<{ name: string; slug: string }>(() => {
    const list = this.appointments();
    if (list.length > 0) {
      return { name: list[0].barberName, slug: list[0].barberSlug };
    }
    const first = this.barbers()[0];
    return first ? { name: first.name, slug: first.slug } : { name: 'Salon', slug: '' };
  });

  // Barber dashboard state and computed signals
  readonly barbers = signal<Barber[]>(this.barberService.getInitialBarbers());
  readonly selectedBarberSlug = signal<string>('filip');
  readonly barberAppointments = signal<AppointmentRecord[]>([]);
  readonly workingDays = signal<WorkingDayOption[]>([]);
  readonly blacklist = signal<BlacklistEntry[]>([]);

  // Blocked clients with 2+ no-shows
  readonly blockedClients = computed<BlacklistEntry[]>(() =>
    this.blacklist().filter((b) => b.noShowCount >= 2)
  );

  // Barber table time filters
  readonly barberTimeFilter = signal<BarberTimeFilter>('TODAY');
  readonly barberDateFilter = signal<string>('ALL'); // 'ALL' or YYYY-MM-DD
  readonly barberSourceFilter = signal<'ALL' | 'ONLINE' | 'PHONE'>('ALL');
  readonly barberSearchQuery = signal<string>('');

  readonly todayIso = computed<string>(() => {
    const days = this.workingDays();
    if (days.length > 0) return days[0].iso;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  readonly tomorrowIso = computed<string>(() => {
    const days = this.workingDays();
    if (days.length > 1) return days[1].iso;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  readonly currentMonthPrefix = computed<string>(() => {
    return this.todayIso().slice(0, 7);
  });

  // Barber modals state
  readonly phoneModalOpen = signal(false);
  readonly phoneFormSubmitted = signal(false);
  readonly blockModalOpen = signal(false);
  readonly blockFormSubmitted = signal(false);
  readonly blockConflicts = signal<AppointmentRecord[]>([]);
  readonly extraAvailModalOpen = signal(false);
  readonly extraAvailFormSubmitted = signal(false);
  readonly editAppointmentModalOpen = signal(false);
  readonly editingAppointment = signal<AppointmentRecord | null>(null);
  readonly editAppointmentSlots = signal<TimeSlot[]>([]);
  readonly manualBlockClientModalOpen = signal(false);
  readonly manualBlockClientSubmitted = signal(false);
  readonly serviceModalOpen = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceFormSubmitted = signal(false);
  readonly serviceToDelete = signal<ServiceItem | null>(null);

  // Active barber profile object (robust matching, never returns null in barber mode)
  readonly currentBarber = computed<Barber | null>(() => {
    const slug = (this.selectedBarberSlug() || '').trim().toLowerCase();
    const list = this.barbers();
    const found = list.find((b) => b.slug.toLowerCase() === slug);
    if (found) {
      return found;
    }
    // Fallback: match by partial slug or name
    const byPrefix = list.find((b) => slug.startsWith(b.slug) || b.slug.startsWith(slug));
    if (byPrefix) {
      return byPrefix;
    }
    // Synthesize profile for any dynamically registered barber
    const user = this.authService.currentUser();
    if (user && this.authService.isBarber(user)) {
      return {
        id: 'b-' + slug,
        slug: slug,
        name: user.displayName || (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Frizer'),
        bio: 'Frizer profesionist Gang Style',
        photoUrl: '/images/gangstyle.jpg',
        phone: user.phone || '0770 426 308',
        specialties: ['Tuns Modern', 'Aranjat Barbă'],
        portfolio: [],
      };
    }
    return list[0] ?? null;
  });

  // Services for the currently selected barber (CRUD-enabled)
  readonly barberServices = signal<ServiceItem[]>([]);

  // Barber working schedule (STANDARD vs CUSTOM), active blocks/vacations, and extra availability days
  readonly barberScheduleMode = signal<'STANDARD' | 'CUSTOM'>('STANDARD');
  readonly barberCustomDays = signal<BarberDaySchedule[]>([]);
  readonly barberActiveBlocks = signal<BarberBlockSummary[]>([]);
  readonly barberExtraAvailabilities = signal<BarberExtraAvailability[]>([]);
  readonly scheduleHourOptions: string[] = [
    '08:00',
    '08:30',
    '09:00',
    '09:30',
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00',
    '12:30',
    '13:00',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
    '21:00',
  ];

  // Filtered appointments for the barber table (STRICTLY real upcoming clients, past appointments removed dynamically)
  readonly filteredBarberAppointments = computed<AppointmentRecord[]>(() => {
    const timeFilter = this.barberTimeFilter();
    const today = this.todayIso();
    const tomorrow = this.tomorrowIso();
    const month = this.currentMonthPrefix();
    const query = this.barberSearchQuery().trim().toLowerCase();

    return this.barberAppointments()
      .filter((apt) => {
        // Exclude blocked intervals and cancelled appointments - only real clients appear
        if (apt.source === 'BLOCKED' || apt.status === 'CANCELLED') {
          return false;
        }

        // Dynamically remove appointments that have already passed the current time strictly when viewing TODAY's agenda
        if (timeFilter === 'TODAY' && this.isPast(apt)) {
          return false;
        }

        // Apply time filter
        if (timeFilter === 'TODAY' && apt.dateIso !== today) {
          return false;
        }
        if (timeFilter === 'TOMORROW' && apt.dateIso !== tomorrow) {
          return false;
        }
        if (timeFilter === 'MONTH' && !apt.dateIso.startsWith(month)) {
          return false;
        }
        // 'ALL' includes all active upcoming real clients

        // Search query
        if (query) {
          const fullName = `${apt.clientLastName} ${apt.clientFirstName}`.toLowerCase();
          const phone = apt.clientPhone.replace(/\s+/g, '').toLowerCase();
          const cleanQuery = query.replace(/\s+/g, '');
          const service = apt.serviceName.toLowerCase();
          return (
            fullName.includes(query) ||
            phone.includes(cleanQuery) ||
            service.includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.startMinutes - b.startMinutes);
  });

  // Compact multi-day schedule grouped by day (short info: interval, client name, chosen package)
  readonly barberMultiDayGroups = computed<
    { dateIso: string; dateLabel: string; items: AppointmentRecord[] }[]
  >(() => {
    const sourceFilter = this.barberSourceFilter();
    const activeList = this.barberAppointments()
      .filter((apt) => {
        if (apt.source === 'BLOCKED' || apt.status === 'CANCELLED') {
          return false;
        }
        if (sourceFilter === 'ONLINE' && (apt.source ?? 'ONLINE') !== 'ONLINE') {
          return false;
        }
        if (sourceFilter === 'PHONE' && apt.source !== 'PHONE') {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.startMinutes - b.startMinutes);

    const groupsMap = new Map<
      string,
      { dateIso: string; dateLabel: string; items: AppointmentRecord[] }
    >();

    for (const apt of activeList) {
      const existing = groupsMap.get(apt.dateIso);
      if (existing) {
        existing.items.push(apt);
      } else {
        groupsMap.set(apt.dateIso, {
          dateIso: apt.dateIso,
          dateLabel: apt.dateLabel,
          items: [apt],
        });
      }
    }

    return Array.from(groupsMap.values());
  });

  // Barber stats for the current filter
  readonly barberActiveBookingsCount = computed<number>(
    () =>
      this.filteredBarberAppointments().filter(
        (a) =>
          a.source !== 'BLOCKED' &&
          (a.status === 'CONFIRMED' || a.status === 'COMPLETED')
      ).length
  );

  readonly barberPhoneBookingsCount = computed<number>(
    () =>
      this.filteredBarberAppointments().filter(
        (a) => a.source === 'PHONE' && a.status !== 'CANCELLED'
      ).length
  );

  readonly barberBlockedCount = computed<number>(
    () =>
      this.filteredBarberAppointments().filter(
        (a) => a.source === 'BLOCKED' && a.status === 'CONFIRMED'
      ).length
  );

  // Reactive form for manual/phone bookings
  readonly phoneBookingForm = this.fb.nonNullable.group({
    serviceId: ['', [Validators.required]],
    dateIso: ['', [Validators.required]],
    startTime: ['', [Validators.required]],
    clientName: ['', [Validators.required, Validators.minLength(2)]],
    clientPhone: ['', [Validators.required, Validators.pattern(/^[0-9\s+]{9,14}$/)]],
    notes: [''],
  });

  // Available slots for the selected service and date inside the phone booking modal
  readonly phoneModalSlots = signal<TimeSlot[]>([]);

  // Reactive form for blocking an interval, full day off, or multi-day vacation
  readonly blockIntervalForm = this.fb.nonNullable.group({
    blockType: ['INTERVAL' as 'INTERVAL' | 'FULL_DAY' | 'VACATION'],
    dateIso: ['', [Validators.required]],
    endDateIso: [''],
    startTime: ['13:00', [Validators.required]],
    endTime: ['14:00', [Validators.required]],
    reason: ['Pauză de masă / Indisponibil', [Validators.required]],
  });

  // Reactive form for Barber Services & Prices CRUD
  readonly barberServiceForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    durationMinutes: [45, [Validators.required, Validators.min(5)]],
    priceRon: [60, [Validators.required, Validators.min(5)]],
  });

  // Reactive form for adding a date-specific extra available day or extended hours
  readonly extraAvailabilityForm = this.fb.nonNullable.group({
    dateIso: ['', [Validators.required]],
    startTime: ['10:00', [Validators.required]],
    endTime: ['16:00', [Validators.required]],
    note: ['Program suplimentar / Zi deschisă', [Validators.required]],
  });

  // Reactive form for editing/rescheduling an existing client appointment from the card
  readonly editAppointmentForm = this.fb.nonNullable.group({
    serviceId: ['', [Validators.required]],
    dateIso: ['', [Validators.required]],
    startTime: ['', [Validators.required]],
    notes: [''],
  });

  // Reactive form for manually blocking a rare no-show client from online bookings
  readonly manualBlockClientForm = this.fb.nonNullable.group({
    clientName: ['', [Validators.required, Validators.minLength(2)]],
    clientPhone: ['', [Validators.required, Validators.pattern(/^[0-9\s+()-]{9,16}$/)]],
    reason: ['Neprezentare la programare', [Validators.required]],
  });

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (!user && typeof window !== 'undefined') {
      this.router.navigate(['/login']);
      return;
    }

    this.barberService.getAll().subscribe({
      next: (list) => {
        this.barbers.set(list);
        if (this.authService.isBarber(user)) {
          const userSlug = this.authService.getCurrentBarberSlug(user);
          const matched = list.find((b) => b.slug.toLowerCase() === userSlug.toLowerCase() || userSlug.startsWith(b.slug));
          if (matched && matched.slug !== this.selectedBarberSlug()) {
            this.selectedBarberSlug.set(matched.slug);
            this.refreshAllData();
          }
        }
      },
    });
    const days = this.generateWorkingDays(7);
    this.workingDays.set(days);

    // Set view strictly based on logged-in user's role
    if (this.authService.isBarber(user)) {
      this.viewMode.set('BARBER');
      this.notificationService.requestNotificationPermission();
      // Scalable barber resolution: automatically maps to the logged-in barber's slug (generic, zero hardcoding)
      const userBarberSlug = this.authService.getCurrentBarberSlug(user) || 'filip';
      this.selectedBarberSlug.set(userBarberSlug);
    } else if (this.authService.isAdmin(user)) {
      this.viewMode.set('BARBER');
      this.notificationService.requestNotificationPermission();
      const defaultSlug = this.barbers()[0]?.slug || 'filip';
      this.selectedBarberSlug.set(defaultSlug);
    } else {
      this.viewMode.set('CLIENT');
    }

    this.refreshAllData();
  }

  refreshAllData(): void {
    const user = this.authService.currentUser();
    const email = user?.email ?? '';
    const phone = user?.phone ?? '';
    const slug = this.selectedBarberSlug();
    if (this.viewMode() === 'BARBER') {
      this.notificationService.setMonitoredBarber(slug);
    } else {
      this.notificationService.clearMonitoredBarber();
    }
    this.appointments.set(this.catalogService.getAppointmentsByEmail(email, phone));
    this.barberAppointments.set(slug ? this.catalogService.getAppointmentsByBarber(slug) : []);
    this.barberActiveBlocks.set(this.catalogService.getActiveBlocksForBarber(slug));
    this.barberExtraAvailabilities.set(this.catalogService.getExtraAvailabilityForBarber(slug));

    const schedule = this.catalogService.getBarberSchedule(slug);
    this.barberScheduleMode.set(schedule.mode);
    this.barberCustomDays.set(schedule.days.map((d) => ({ ...d })));
    this.blacklist.set(this.catalogService.getBlacklist());

    this.catalogService.fetchServicesByBarber(slug).subscribe({
      next: (services) => this.barberServices.set(services),
    });
  }

  // Switches between Client view and Barber view (allowed only for ADMIN)
  setViewMode(mode: DashboardViewMode, barberSlug?: string): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.viewMode.set(mode);
    if (barberSlug) {
      this.selectedBarberSlug.set(barberSlug);
    }
    this.refreshAllData();
  }

  selectBarberTab(slug: string): void {
    this.selectedBarberSlug.set(slug);
    this.refreshAllData();
  }

  // Client actions
  setTab(tab: PortalFilterTab): void {
    this.activeTab.set(tab);
  }

  isPast(apt: AppointmentRecord): boolean {
    return this.catalogService.isPastAppointment(apt);
  }

  canCancel(apt: AppointmentRecord): boolean {
    return this.catalogService.canCancelAppointment(apt);
  }

  getBarberPhone(barberSlug?: string): string {
    const slug = (barberSlug || '').toLowerCase();
    const found = this.barbers().find((b) => b.slug.toLowerCase() === slug);
    return found?.phone || '0770 426 308';
  }

  /**
   * Formats a client's phone number cleanly with a single leading 0 (e.g. "0770 426 308"),
   * eliminating redundant "+40 0..." double-zero artifacts.
   */
  formatDisplayPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    let cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+400')) {
      cleaned = cleaned.substring(3); // strips +40, keeps single 0
    } else if (cleaned.startsWith('+40')) {
      cleaned = '0' + cleaned.substring(3);
    } else if (!cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }
    // Format Romanian standard 10-digit mobile number: 07XX XXX XXX
    if (cleaned.length === 10) {
      return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
    }
    return cleaned;
  }

  /**
   * Generates a clean tel: link with proper country code, avoiding "+400" double-zero.
   */
  getTelHref(phone: string | null | undefined): string {
    if (!phone) return 'tel:';
    let cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+400')) {
      cleaned = '+40' + cleaned.substring(4);
    } else if (cleaned.startsWith('0')) {
      cleaned = '+40' + cleaned.substring(1);
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+40' + cleaned;
    }
    return 'tel:' + cleaned;
  }

  getStatusLabel(apt: AppointmentRecord): string {
    if (apt.status === 'CANCELLED') {
      return 'Anulată';
    }
    if (apt.status === 'NO_SHOW') {
      return 'Neprezentare';
    }
    if (apt.source === 'BLOCKED') {
      return 'Interval Blocat';
    }
    if (apt.status === 'COMPLETED') {
      return 'Finalizată';
    }
    // Automatic completion when appointment time has passed
    if (apt.status === 'CONFIRMED' && this.isPast(apt)) {
      return 'Finalizată';
    }
    return 'Confirmată';
  }

  getStatusModifier(
    apt: AppointmentRecord
  ): 'confirmed' | 'cancelled' | 'completed' | 'noshow' | 'blocked' {
    if (apt.status === 'CANCELLED') {
      return 'cancelled';
    }
    if (apt.status === 'NO_SHOW') {
      return 'noshow';
    }
    if (apt.source === 'BLOCKED') {
      return 'blocked';
    }
    if (apt.status === 'COMPLETED' || this.isPast(apt)) {
      return 'completed';
    }
    return 'confirmed';
  }

  openCancelModal(apt: AppointmentRecord): void {
    if (!this.canCancel(apt)) {
      return;
    }
    this.appointmentToCancel.set(apt);
  }

  closeCancelModal(): void {
    this.appointmentToCancel.set(null);
  }

  confirmCancel(): void {
    const target = this.appointmentToCancel();
    if (!target) {
      return;
    }

    // Guard: Prevent online cancellation if less than 3 hours remain
    if (!this.canCancel(target)) {
      this.closeCancelModal();
      this.showFeedback(
        `Pentru anulări cu mai puțin de 3 ore înainte, te rugăm să apelezi frizerul la ${this.getBarberPhone(target.barberSlug)}.`
      );
      return;
    }

    const ok = this.catalogService.cancelAppointment(target.id);
    this.appointmentToCancel.set(null);

    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Programarea la ${target.barberName} (${target.dateLabel}, ${target.startTime}) a fost anulată cu succes.`
      );
    }
  }

  rescheduleOneClick(apt: AppointmentRecord): void {
    this.router.navigate(['/', apt.barberSlug], {
      queryParams: { serviceId: apt.serviceId },
    });
  }

  // Barber dashboard actions
  setBarberTimeFilter(filter: BarberTimeFilter): void {
    this.barberTimeFilter.set(filter);
  }

  setBarberDateFilter(dateIso: string): void {
    this.barberDateFilter.set(dateIso);
  }

  setBarberSourceFilter(source: 'ALL' | 'ONLINE' | 'PHONE'): void {
    this.barberSourceFilter.set(source);
  }

  onBarberDateInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.barberDateFilter.set(input.value || 'ALL');
  }

  onBarberSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.barberSearchQuery.set(input.value);
  }

  // Updates appointment status from Barber table (Completed, No-Show, Cancelled, or Reset)
  setBarberAppointmentStatus(
    apt: AppointmentRecord,
    status: AppointmentRecord['status']
  ): void {
    const ok = this.catalogService.updateAppointmentStatus(apt.id, status);
    if (!ok) {
      return;
    }

    let isNowBlocked = false;
    let currentNoShows = 0;

    // If marked as NO_SHOW, also record client in the Blacklist
    if (status === 'NO_SHOW' && apt.source !== 'BLOCKED') {
      const entry = this.catalogService.addToBlacklist({
        clientName: `${apt.clientLastName} ${apt.clientFirstName}`.trim(),
        clientPhone: apt.clientPhone,
        clientEmail: apt.clientEmail,
        reason: `Neprezentare la ${apt.barberName} pe ${apt.dateLabel} la ${apt.startTime}`,
        addedBy: apt.barberName,
      });
      currentNoShows = entry.noShowCount;
      if (currentNoShows >= 2) {
        isNowBlocked = true;
      }
    }

    this.refreshAllData();

    if (isNowBlocked) {
      this.showFeedback(
        `⚠️ Clientul ${apt.clientLastName} are ${currentNoShows} neprezentări! Programările online au fost blocate automat (trebuie să sune la salon).`
      );
      return;
    }

    const labels: Record<AppointmentRecord['status'], string> = {
      COMPLETED: 'marcată ca Finalizată',
      NO_SHOW: `marcată ca Neprezentare (${currentNoShows}/2 neprezentări)`,
      CANCELLED:
        apt.source === 'BLOCKED'
          ? 'deblocată, iar intervalul este din nou liber pe site'
          : 'anulată, iar locul a fost eliberat pe site',
      CONFIRMED: 'reconfirmată',
    };

    this.showFeedback(
      `Programarea de la ${apt.startTime} - ${apt.endTime} a fost ${labels[status]}.`
    );
  }

  // Unblocks a client who was restricted due to 2+ no-shows (e.g., after clarifying by phone)
  unblockClient(entry: BlacklistEntry): void {
    const ok = this.catalogService.unblockClient(entry.clientPhone || entry.id);
    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Accesul online pentru ${entry.clientName} (${entry.clientPhone}) a fost deblocat. Clientul se poate programa din nou online.`
      );
    }
  }

  unblockClientByPhone(phone: string, clientName?: string): void {
    const ok = this.catalogService.unblockClient(phone);
    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Accesul online pentru ${clientName || phone} a fost deblocat cu succes. Clientul se poate reprograma.`
      );
    }
  }

  isAppointmentClientBlocked(phone: string): boolean {
    return this.catalogService.isClientBlocked(phone).blocked;
  }

  getClientNoShows(phone: string): number {
    return this.catalogService.isClientBlocked(phone).noShowCount;
  }

  // Opens the manual/phone booking modal
  openPhoneBookingModal(): void {
    const services = this.barberServices();
    const days = this.workingDays();
    const defaultServiceId = services[0]?.id ?? '';
    const defaultDateIso =
      this.barberDateFilter() !== 'ALL'
        ? this.barberDateFilter()
        : (days[0]?.iso ?? '');

    this.phoneBookingForm.reset({
      serviceId: defaultServiceId,
      dateIso: defaultDateIso,
      startTime: '',
      clientName: '',
      clientPhone: '',
      notes: '',
    });
    this.phoneFormSubmitted.set(false);
    this.recomputePhoneModalSlots();
    this.phoneModalOpen.set(true);
  }

  closePhoneBookingModal(): void {
    this.phoneModalOpen.set(false);
  }

  onPhoneFormSelectionChange(): void {
    this.phoneBookingForm.controls.startTime.setValue('');
    this.recomputePhoneModalSlots();
  }

  selectPhoneSlot(slot: TimeSlot): void {
    if (!slot.available) {
      return;
    }
    this.phoneBookingForm.controls.startTime.setValue(slot.startTime);
  }

  private recomputePhoneModalSlots(): void {
    const { serviceId, dateIso } = this.phoneBookingForm.getRawValue();
    const service = this.barberServices().find((s) => s.id === serviceId);
    if (!service || !dateIso) {
      this.phoneModalSlots.set([]);
      return;
    }
    const slots = this.catalogService.getSlotsForDate(
      this.selectedBarberSlug(),
      dateIso,
      service
    );
    this.phoneModalSlots.set(slots);

    // Pre-select first available slot for speed
    const firstFree = slots.find((s) => s.available);
    if (firstFree && !this.phoneBookingForm.controls.startTime.value) {
      this.phoneBookingForm.controls.startTime.setValue(firstFree.startTime);
    }
  }

  submitPhoneBooking(): void {
    this.phoneFormSubmitted.set(true);
    if (this.phoneBookingForm.invalid) {
      this.phoneBookingForm.markAllAsTouched();
      return;
    }

    const barber = this.currentBarber();
    const val = this.phoneBookingForm.getRawValue();
    const service = this.barberServices().find((s) => s.id === val.serviceId);
    const slot = this.phoneModalSlots().find((s) => s.startTime === val.startTime);

    if (!barber || !service || !slot) {
      return;
    }

    const nameParts = val.clientName.trim().split(/\s+/);
    const lastName = nameParts[0] ?? 'Client';
    const firstName = nameParts.slice(1).join(' ') || '';

    this.catalogService.createAppointment({
      barberSlug: barber.slug,
      barberName: barber.name,
      barberPhotoUrl: barber.photoUrl,
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      slotMinutes: service.slotMinutes,
      priceRon: service.priceRon,
      dateIso: val.dateIso,
      dateLabel: this.formatIsoToRoLabel(val.dateIso),
      startTime: slot.startTime,
      endTime: slot.endTime,
      clientFirstName: firstName,
      clientLastName: lastName,
      clientEmail: 'manual@gangstyle.ro',
      clientPhone: val.clientPhone.trim(),
      notes: val.notes.trim(),
      source: 'PHONE',
    });

    this.phoneModalOpen.set(false);
    this.refreshAllData();
    this.showFeedback(
      `Programarea manuală pentru ${val.clientName} (${slot.label}) a fost adăugată și ora a fost ocupată pe site!`
    );
  }

  // Opens the block interval / day off / vacation modal
  openBlockModal(): void {
    const days = this.workingDays();
    const defaultDateIso =
      this.barberDateFilter() !== 'ALL'
        ? this.barberDateFilter()
        : (days[0]?.iso ?? '');
    const defaultEndIso = days[2]?.iso ?? defaultDateIso;

    this.blockIntervalForm.reset({
      blockType: 'INTERVAL',
      dateIso: defaultDateIso,
      endDateIso: defaultEndIso,
      startTime: '13:00',
      endTime: '14:00',
      reason: 'Pauză de masă',
    });
    this.blockConflicts.set([]);
    this.blockFormSubmitted.set(false);
    this.blockModalOpen.set(true);
  }

  closeBlockModal(): void {
    this.blockConflicts.set([]);
    this.blockModalOpen.set(false);
  }

  clearBlockConflicts(): void {
    if (this.blockConflicts().length > 0) {
      this.blockConflicts.set([]);
    }
  }

  setBlockType(type: 'INTERVAL' | 'FULL_DAY' | 'VACATION'): void {
    this.blockIntervalForm.controls.blockType.setValue(type);
    this.blockConflicts.set([]);
    const currentStartIso = this.blockIntervalForm.controls.dateIso.value;
    if (type === 'FULL_DAY') {
      this.blockIntervalForm.controls.startTime.setValue('10:00');
      this.blockIntervalForm.controls.endTime.setValue('18:00');
      this.blockIntervalForm.controls.reason.setValue('Zi liberă');
    } else if (type === 'VACATION') {
      this.blockIntervalForm.controls.startTime.setValue('00:00');
      this.blockIntervalForm.controls.endTime.setValue('23:59');
      if (!this.blockIntervalForm.controls.endDateIso.value) {
        this.blockIntervalForm.controls.endDateIso.setValue(currentStartIso);
      }
      this.blockIntervalForm.controls.reason.setValue('Concediu');
    } else {
      this.blockIntervalForm.controls.startTime.setValue('13:00');
      this.blockIntervalForm.controls.endTime.setValue('14:00');
      this.blockIntervalForm.controls.reason.setValue('Pauză de masă');
    }
  }

  // Validates and submits a time block; if existing client appointments overlap, pauses and shows a warning with direct call action
  submitBlockInterval(forceConfirm = false): void {
    this.blockFormSubmitted.set(true);
    if (this.blockIntervalForm.invalid) {
      this.blockIntervalForm.markAllAsTouched();
      return;
    }

    const barber = this.currentBarber();
    if (!barber) {
      return;
    }

    const val = this.blockIntervalForm.getRawValue();
    const startTime = val.blockType === 'FULL_DAY' ? '10:00' : val.startTime;
    const endTime = val.blockType === 'FULL_DAY' ? '18:00' : val.endTime;

    if (val.blockType === 'VACATION') {
      const endIso = val.endDateIso || val.dateIso;
      if (endIso < val.dateIso) {
        this.showFeedback('Data de sfârșit a concediului trebuie să fie după data de început.');
        return;
      }
    } else if (val.blockType === 'INTERVAL' && startTime >= endTime) {
      this.showFeedback('Ora de sfârșit trebuie să fie după ora de început.');
      return;
    }

    // Check if there are already scheduled clients in this interval before applying the block
    if (!forceConfirm) {
      const conflicts = this.catalogService.findConflictingAppointmentsForBlock({
        barberSlug: barber.slug,
        blockType: val.blockType,
        dateIso: val.dateIso,
        endDateIso: val.endDateIso || val.dateIso,
        startTime,
        endTime,
      });

      if (conflicts.length > 0) {
        this.blockConflicts.set(conflicts);
        return;
      }
    }

    if (val.blockType === 'VACATION') {
      const endIso = val.endDateIso || val.dateIso;
      const created = this.catalogService.blockVacationRange({
        barberSlug: barber.slug,
        barberName: barber.name,
        barberPhotoUrl: barber.photoUrl,
        startDateIso: val.dateIso,
        endDateIso: endIso,
        reason: val.reason.trim() || 'Concediu',
      });

      this.blockConflicts.set([]);
      this.blockModalOpen.set(false);
      this.refreshAllData();
      this.showFeedback(
        `Concediul (${this.formatIsoToRoLabel(val.dateIso)} – ${this.formatIsoToRoLabel(endIso)}, ${created.length} zile) a fost blocat pentru ${barber.name}.`
      );
      return;
    }

    this.catalogService.blockTimeInterval({
      barberSlug: barber.slug,
      barberName: barber.name,
      barberPhotoUrl: barber.photoUrl,
      dateIso: val.dateIso,
      dateLabel: this.formatIsoToRoLabel(val.dateIso),
      startTime,
      endTime,
      reason: val.reason.trim(),
      blockType: val.blockType,
    });

    this.blockConflicts.set([]);
    this.blockModalOpen.set(false);
    this.refreshAllData();
    this.showFeedback(
      val.blockType === 'FULL_DAY'
        ? `Ziua (${this.formatIsoToRoLabel(val.dateIso)}) a fost blocată complet pentru ${barber.name}.`
        : `Intervalul ${startTime} - ${endTime} (${this.formatIsoToRoLabel(val.dateIso)}) a fost blocat pentru ${barber.name}.`
    );
  }

  // Confirms the block for new public visitors while preserving already scheduled client appointments
  confirmBlockIntervalAnyway(): void {
    this.submitBlockInterval(true);
  }

  removeBarberBlock(block: BarberBlockSummary): void {
    const ok = this.catalogService.removeBarberBlock(block.id);
    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Blocajul (${block.label} · ${block.timeLabel}) a fost eliminat, iar orele sunt din nou disponibile pentru clienți.`
      );
    }
  }

  // Opens modal to add a one-off working day (e.g. Sunday/Saturday) or extended hours without changing the recurring schedule
  openExtraAvailabilityModal(): void {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const defaultDateIso = `${yyyy}-${mm}-${dd}`;

    this.extraAvailabilityForm.reset({
      dateIso: defaultDateIso,
      startTime: '10:00',
      endTime: '16:00',
      note: 'Program suplimentar / Zi deschisă',
    });
    this.extraAvailFormSubmitted.set(false);
    this.extraAvailModalOpen.set(true);
  }

  closeExtraAvailabilityModal(): void {
    this.extraAvailModalOpen.set(false);
  }

  submitExtraAvailability(): void {
    this.extraAvailFormSubmitted.set(true);
    if (this.extraAvailabilityForm.invalid) {
      this.extraAvailabilityForm.markAllAsTouched();
      return;
    }

    const barber = this.currentBarber();
    if (!barber) {
      return;
    }

    const val = this.extraAvailabilityForm.getRawValue();
    if (val.startTime >= val.endTime) {
      this.showFeedback('Ora de sfârșit trebuie să fie după ora de început.');
      return;
    }

    const created = this.catalogService.addExtraAvailability({
      barberSlug: barber.slug,
      dateIso: val.dateIso,
      dateLabel: this.formatIsoToRoLabel(val.dateIso),
      startTime: val.startTime,
      endTime: val.endTime,
      note: val.note.trim(),
    });

    this.extraAvailModalOpen.set(false);
    this.refreshAllData();
    this.showFeedback(
      `Disponibilitatea suplimentară (${created.dateLabel}, ${created.startTime} – ${created.endTime}) a fost deschisă pe site pentru ${barber.name}!`
    );
  }

  removeExtraAvailability(item: BarberExtraAvailability): void {
    const ok = this.catalogService.removeExtraAvailability(item.id);
    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Disponibilitatea suplimentară din ${item.dateLabel} (${item.startTime} – ${item.endTime}) a fost eliminată.`
      );
    }
  }

  // Opens modal to edit/reschedule an appointment directly from the client card
  openEditAppointmentModal(apt: AppointmentRecord): void {
    this.editingAppointment.set(apt);
    this.editAppointmentForm.reset({
      serviceId: apt.serviceId,
      dateIso: apt.dateIso,
      startTime: apt.startTime,
      notes: apt.notes ?? '',
    });
    this.recomputeEditAppointmentSlots();
    this.editAppointmentModalOpen.set(true);
  }

  closeEditAppointmentModal(): void {
    this.editAppointmentModalOpen.set(false);
    this.editingAppointment.set(null);
  }

  onEditAppointmentChange(): void {
    this.recomputeEditAppointmentSlots();
  }

  selectEditAppointmentSlot(slot: TimeSlot): void {
    if (!slot.available) {
      return;
    }
    this.editAppointmentForm.controls.startTime.setValue(slot.startTime);
  }

  private recomputeEditAppointmentSlots(): void {
    const currentApt = this.editingAppointment();
    if (!currentApt) {
      this.editAppointmentSlots.set([]);
      return;
    }

    const { serviceId, dateIso } = this.editAppointmentForm.getRawValue();
    const service =
      this.barberServices().find((s) => s.id === serviceId) ?? {
        id: currentApt.serviceId,
        barberSlug: currentApt.barberSlug,
        name: currentApt.serviceName,
        durationMinutes: currentApt.durationMinutes,
        slotMinutes: currentApt.slotMinutes,
        priceRon: currentApt.priceRon,
      };

    if (!dateIso) {
      this.editAppointmentSlots.set([]);
      return;
    }

    // Mark current appointment's own slot as available when editing on the same date
    const rawSlots = this.catalogService.getSlotsForDate(
      this.selectedBarberSlug(),
      dateIso,
      service
    );
    const adjustedSlots = rawSlots.map((slot) => {
      if (dateIso === currentApt.dateIso && slot.startTime === currentApt.startTime) {
        return { ...slot, available: true };
      }
      return slot;
    });

    this.editAppointmentSlots.set(adjustedSlots);
    const currentSelectedStart = this.editAppointmentForm.controls.startTime.value;
    const stillValid = adjustedSlots.some(
      (s) => s.available && s.startTime === currentSelectedStart
    );
    if (!stillValid) {
      const firstFree = adjustedSlots.find((s) => s.available);
      this.editAppointmentForm.controls.startTime.setValue(firstFree?.startTime ?? '');
    }
  }

  submitEditAppointment(): void {
    const currentApt = this.editingAppointment();
    if (!currentApt || this.editAppointmentForm.invalid) {
      this.editAppointmentForm.markAllAsTouched();
      return;
    }

    const val = this.editAppointmentForm.getRawValue();
    const selectedSrv = this.barberServices().find((s) => s.id === val.serviceId);
    const updated = this.catalogService.updateAppointment(currentApt.id, {
      dateIso: val.dateIso,
      dateLabel: this.formatIsoToRoLabel(val.dateIso),
      startTime: val.startTime,
      serviceId: val.serviceId,
      serviceName: selectedSrv?.name,
      durationMinutes: selectedSrv?.durationMinutes,
      priceRon: selectedSrv?.priceRon,
      notes: val.notes,
    });

    this.closeEditAppointmentModal();
    if (updated) {
      this.refreshAllData();
      this.showFeedback(
        `Programarea pentru ${updated.clientLastName} ${updated.clientFirstName} a fost mutată pe ${updated.dateLabel} (${updated.startTime} – ${updated.endTime}).`
      );
    }
  }

  // Opens modal to manually block an unreliable client who failed to show up (rare 1% case)
  openManualBlockClientModal(): void {
    this.manualBlockClientForm.reset({
      clientName: '',
      clientPhone: '',
      reason: 'Neprezentare la programare',
    });
    this.manualBlockClientSubmitted.set(false);
    this.manualBlockClientModalOpen.set(true);
  }

  closeManualBlockClientModal(): void {
    this.manualBlockClientModalOpen.set(false);
  }

  submitManualBlockClient(): void {
    this.manualBlockClientSubmitted.set(true);
    if (this.manualBlockClientForm.invalid) {
      this.manualBlockClientForm.markAllAsTouched();
      return;
    }

    const val = this.manualBlockClientForm.getRawValue();
    const entry = this.catalogService.addToBlacklist({
      clientName: val.clientName.trim(),
      clientPhone: val.clientPhone.trim(),
      reason: val.reason.trim() || 'Neprezentare la programare',
      noShowCount: 2,
      addedBy: this.currentBarber()?.name || 'Frizer',
    });

    this.closeManualBlockClientModal();
    this.refreshAllData();
    this.showFeedback(
      `Clientul ${entry.clientName} (${entry.clientPhone}) a fost restricționat de la programările online.`
    );
  }

  // Switches between STANDARD salon schedule and CUSTOM weekly schedule
  selectScheduleMode(mode: 'STANDARD' | 'CUSTOM'): void {
    this.barberScheduleMode.set(mode);
    const slug = this.selectedBarberSlug();
    const barberName = this.currentBarber()?.name ?? slug;

    const currentDays =
      this.barberCustomDays().length === 7
        ? this.barberCustomDays()
        : this.catalogService.getDefaultDaysSchedule();

    const config: BarberScheduleConfig = {
      barberSlug: slug,
      mode,
      days: currentDays,
      updatedAt: new Date().toISOString(),
    };

    this.catalogService.saveBarberSchedule(config);
    if (this.phoneModalOpen()) {
      this.recomputePhoneModalSlots();
    }

    if (mode === 'STANDARD') {
      this.showFeedback(
        `Programul Standard al Salonului (Luni – Vineri, 10:00 – 18:00) este acum activ pentru ${barberName}.`
      );
    } else {
      this.showFeedback(
        `Modul „Program Personalizat” a fost selectat pentru ${barberName}. Configurează zilele mai jos și apasă Salvează.`
      );
    }
  }

  toggleDayWorking(dayOfWeek: number): void {
    this.barberCustomDays.update((days) =>
      days.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, working: !d.working } : d))
    );
  }

  updateDayStartTime(dayOfWeek: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    this.barberCustomDays.update((days) =>
      days.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, startTime: value } : d))
    );
  }

  updateDayEndTime(dayOfWeek: number, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    this.barberCustomDays.update((days) =>
      days.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, endTime: value } : d))
    );
  }

  saveCustomSchedule(): void {
    const slug = this.selectedBarberSlug();
    const barberName = this.currentBarber()?.name ?? slug;
    const days = this.barberCustomDays();

    for (const day of days) {
      if (day.working && day.startTime >= day.endTime) {
        this.showFeedback(
          `Pentru ${day.dayName}, ora de sfârșit (${day.endTime}) trebuie să fie după ora de început (${day.startTime}).`
        );
        return;
      }
    }

    this.catalogService.saveBarberSchedule({
      barberSlug: slug,
      mode: 'CUSTOM',
      days,
      updatedAt: new Date().toISOString(),
    });
    this.barberScheduleMode.set('CUSTOM');
    if (this.phoneModalOpen()) {
      this.recomputePhoneModalSlots();
    }
    this.showFeedback(
      `Programul personalizat pentru ${barberName} a fost salvat! Intervalele disponibile pentru clienți s-au actualizat.`
    );
  }

  // Opens modal for Barber to Add or Edit a Service & Price
  openBarberServiceModal(service?: ServiceItem): void {
    this.serviceFormSubmitted.set(false);
    if (service) {
      this.editingServiceId.set(service.id);
      this.barberServiceForm.reset({
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceRon: service.priceRon,
      });
    } else {
      this.editingServiceId.set(null);
      this.barberServiceForm.reset({
        name: '',
        durationMinutes: 45,
        priceRon: 60,
      });
    }
    this.serviceModalOpen.set(true);
  }

  closeBarberServiceModal(): void {
    this.serviceModalOpen.set(false);
    this.editingServiceId.set(null);
  }

  submitBarberService(): void {
    this.serviceFormSubmitted.set(true);
    if (this.barberServiceForm.invalid) {
      this.barberServiceForm.markAllAsTouched();
      return;
    }

    const val = this.barberServiceForm.getRawValue();
    const editId = this.editingServiceId();

    if (editId) {
      this.catalogService
        .updateServiceApi(editId, {
          barberSlug: this.selectedBarberSlug(),
          name: val.name,
          durationMinutes: Number(val.durationMinutes),
          priceRon: Number(val.priceRon),
        })
        .subscribe({
          next: () => {
            this.closeBarberServiceModal();
            this.refreshAllData();
            this.showFeedback(
              `Serviciul „${val.name}” (${val.priceRon} RON) a fost actualizat în baza de date!`
            );
          },
          error: () => {
            this.showFeedback('Nu am putut actualiza serviciul. Verifică serverul.');
          },
        });
    } else {
      this.catalogService
        .createServiceApi({
          barberTarget: this.selectedBarberSlug(),
          name: val.name,
          durationMinutes: Number(val.durationMinutes),
          priceRon: Number(val.priceRon),
        })
        .subscribe({
          next: () => {
            this.closeBarberServiceModal();
            this.refreshAllData();
            this.showFeedback(
              `Pachetul nou „${val.name}” (${val.priceRon} RON) a fost salvat pentru ${this.currentBarber()?.name}!`
            );
          },
          error: () => {
            this.showFeedback('Nu am putut adăuga serviciul. Verifică serverul.');
          },
        });
    }
  }

  // Opens confirmation modal before deleting a barber service package.
  openDeleteBarberServiceModal(service: ServiceItem): void {
    this.serviceToDelete.set(service);
  }

  closeDeleteBarberServiceModal(): void {
    this.serviceToDelete.set(null);
  }

  // Deletes the selected service package after modal confirmation.
  confirmDeleteBarberService(): void {
    const target = this.serviceToDelete();
    if (!target) {
      return;
    }

    this.catalogService.deleteServiceApi(target.id).subscribe({
      next: () => {
        this.serviceToDelete.set(null);
        this.refreshAllData();
        this.showFeedback(`Serviciul „${target.name}” a fost șters din baza de date.`);
      },
      error: () => {
        this.serviceToDelete.set(null);
        this.showFeedback('Nu am putut șterge serviciul. Verifică serverul.');
      },
    });
  }

  // Opens confirmation modal to delete/cancel appointment from Barber view
  openDeleteModalForBarber(apt: AppointmentRecord): void {
    this.appointmentToDelete.set(apt);
  }

  closeDeleteModal(): void {
    this.appointmentToDelete.set(null);
  }

  confirmDeleteAppointment(): void {
    const target = this.appointmentToDelete();
    if (!target) {
      return;
    }

    const ok = this.catalogService.cancelAppointment(target.id);
    this.appointmentToDelete.set(null);

    if (ok) {
      this.refreshAllData();
      this.showFeedback(
        `Programarea pentru ${target.clientLastName} ${target.clientFirstName} (${target.startTime} - ${target.endTime}) a fost ștearsă, iar intervalul a fost eliberat.`
      );
    }
  }

  closeAllModals(): void {
    this.closeCancelModal();
    this.closeDeleteModal();
    this.closePhoneBookingModal();
    this.closeBlockModal();
    this.closeExtraAvailabilityModal();
    this.closeEditAppointmentModal();
    this.closeManualBlockClientModal();
    this.closeBarberServiceModal();
    this.closeDeleteBarberServiceModal();
    this.twoFactorModalOpen.set(false);
  }

  openTwoFactorModal(): void {
    this.twoFactorModalOpen.set(true);
  }

  closeTwoFactorModal(): void {
    this.twoFactorModalOpen.set(false);
  }

  onTwoFactorStatusChanged(msg: string): void {
    this.showFeedback(msg);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  private showFeedback(msg: string): void {
    this.feedbackMessage.set(msg);
    setTimeout(() => this.feedbackMessage.set(null), 5000);
  }

  private formatIsoToRoLabel(iso: string): string {
    const found = this.workingDays().find((d) => d.iso === iso);
    if (found) {
      return found.fullLabel;
    }
    const [yyyy, mm, dd] = iso.split('-').map(Number);
    if (!yyyy || !mm || !dd) {
      return iso;
    }
    const d = new Date(yyyy, mm - 1, dd);
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

  private generateWorkingDays(count: number): WorkingDayOption[] {
    const dayNamesShort = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
    const dayNamesFull = [
      'Duminică',
      'Luni',
      'Marți',
      'Miercuri',
      'Joi',
      'Vineri',
      'Sâmbătă',
    ];
    const monthsShort = [
      'Ian',
      'Feb',
      'Mar',
      'Apr',
      'Mai',
      'Iun',
      'Iul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthsFull = [
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

    const result: WorkingDayOption[] = [];
    const cursor = new Date();

    while (result.length < count) {
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 1) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        const iso = `${yyyy}-${mm}-${dd}`;

        result.push({
          iso,
          shortLabel: `${dayNamesShort[dayOfWeek]}, ${cursor.getDate()} ${monthsShort[cursor.getMonth()]}`,
          fullLabel: `${dayNamesFull[dayOfWeek]}, ${cursor.getDate()} ${monthsFull[cursor.getMonth()]}`,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }
}
