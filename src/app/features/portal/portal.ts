import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BarberService } from '../../core/services/barber.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { Barber } from '../../shared/models/barber.model';
import {
  AppointmentRecord,
  ServiceItem,
  TimeSlot,
} from '../../shared/models/service-item.model';

export type PortalFilterTab = 'UPCOMING' | 'HISTORY' | 'ALL';
export type DashboardViewMode = 'CLIENT' | 'BARBER';

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
  imports: [RouterLink, ReactiveFormsModule],
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
  readonly authService = inject(AuthService);

  // Active dashboard view mode: 'CLIENT' or 'BARBER'
  readonly viewMode = signal<DashboardViewMode>('CLIENT');

  // Shared feedback banner message
  readonly feedbackMessage = signal<string | null>(null);

  // ===========================================================================
  // 1. CLIENT DASHBOARD STATE & COMPUTED SIGNALS
  // ===========================================================================
  readonly appointments = signal<AppointmentRecord[]>([]);
  readonly activeTab = signal<PortalFilterTab>('UPCOMING');
  readonly appointmentToCancel = signal<AppointmentRecord | null>(null);

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
    return { name: 'Filip', slug: 'filip' };
  });

  // ===========================================================================
  // 2. BARBER DASHBOARD STATE & COMPUTED SIGNALS (FILIP & SEBI)
  // ===========================================================================
  readonly barbers = signal<Barber[]>([]);
  readonly selectedBarberSlug = signal<'filip' | 'sebi'>('filip');
  readonly barberAppointments = signal<AppointmentRecord[]>([]);
  readonly workingDays = signal<WorkingDayOption[]>([]);

  // Barber table filters
  readonly barberDateFilter = signal<string>('ALL'); // 'ALL' or YYYY-MM-DD
  readonly barberSourceFilter = signal<'ALL' | 'ONLINE' | 'PHONE'>('ALL');
  readonly barberSearchQuery = signal<string>('');

  // Barber modals state
  readonly phoneModalOpen = signal(false);
  readonly phoneFormSubmitted = signal(false);
  readonly blockModalOpen = signal(false);
  readonly blockFormSubmitted = signal(false);
  readonly serviceModalOpen = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceFormSubmitted = signal(false);

  // Active barber profile object
  readonly currentBarber = computed<Barber | null>(() => {
    const slug = this.selectedBarberSlug();
    return this.barbers().find((b) => b.slug === slug) ?? null;
  });

  // Services for the currently selected barber (CRUD-enabled)
  readonly barberServices = signal<ServiceItem[]>([]);

  // Filtered appointments for the barber table (by day + source + name/phone search)
  readonly filteredBarberAppointments = computed<AppointmentRecord[]>(() => {
    const dateFilter = this.barberDateFilter();
    const sourceFilter = this.barberSourceFilter();
    const query = this.barberSearchQuery().trim().toLowerCase();

    return this.barberAppointments()
      .filter((apt) => {
        if (dateFilter !== 'ALL' && apt.dateIso !== dateFilter) {
          return false;
        }
        if (sourceFilter === 'ONLINE' && (apt.source ?? 'ONLINE') !== 'ONLINE') {
          return false;
        }
        if (sourceFilter === 'PHONE' && apt.source !== 'PHONE') {
          return false;
        }
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

  // Reactive form for "+ Adaugă Programare (Telefonică)"
  readonly phoneBookingForm = this.fb.nonNullable.group({
    serviceId: ['', [Validators.required]],
    dateIso: ['', [Validators.required]],
    startTime: ['', [Validators.required]],
    clientName: ['', [Validators.required, Validators.minLength(2)]],
    clientPhone: ['', [Validators.required, Validators.pattern(/^[0-9\s+]{9,14}$/)]],
    notes: [''],
  });

  // Available slots for the selected service & date inside the Phone Booking Modal
  readonly phoneModalSlots = signal<TimeSlot[]>([]);

  // Reactive form for "Blochează Interval / Zi liberă"
  readonly blockIntervalForm = this.fb.nonNullable.group({
    blockType: ['INTERVAL' as 'INTERVAL' | 'FULL_DAY'],
    dateIso: ['', [Validators.required]],
    startTime: ['13:00', [Validators.required]],
    endTime: ['14:00', [Validators.required]],
    reason: ['Pauză de masă / Indisponibil', [Validators.required]],
  });

  // Reactive form for Barber Services & Prices CRUD
  readonly barberServiceForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    durationMinutes: [45, [Validators.required, Validators.min(15)]],
    priceRon: [60, [Validators.required, Validators.min(10)]],
  });

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (!user && typeof window !== 'undefined') {
      this.router.navigate(['/login']);
      return;
    }

    this.barbers.set(this.barberService.getAll());
    const days = this.generateWorkingDays(7);
    this.workingDays.set(days);

    // Set view strictly based on logged-in user's role
    if (user?.role === 'BARBER') {
      this.viewMode.set('BARBER');
      if (user.email.includes('sebi')) {
        this.selectedBarberSlug.set('sebi');
      } else {
        this.selectedBarberSlug.set('filip');
      }
    } else if (user?.role === 'ADMIN') {
      this.viewMode.set('BARBER');
      this.selectedBarberSlug.set('filip');
    } else {
      this.viewMode.set('CLIENT');
    }

    this.refreshAllData();
  }

  refreshAllData(): void {
    const user = this.authService.currentUser();
    const email = user?.email ?? 'demo@gangstyle.ro';
    this.appointments.set(this.catalogService.getAppointmentsByEmail(email));
    this.barberAppointments.set(
      this.catalogService.getAppointmentsByBarber(this.selectedBarberSlug())
    );
    this.barberServices.set(
      this.catalogService.getByBarberSlug(this.selectedBarberSlug())
    );
  }

  // Switches between Client view and Barber view (allowed only for ADMIN)
  setViewMode(mode: DashboardViewMode, barberSlug?: 'filip' | 'sebi'): void {
    if (this.authService.currentUser()?.role !== 'ADMIN') {
      return;
    }
    this.viewMode.set(mode);
    if (barberSlug) {
      this.selectedBarberSlug.set(barberSlug);
    }
    this.refreshAllData();
  }

  selectBarberTab(slug: 'filip' | 'sebi'): void {
    this.selectedBarberSlug.set(slug);
    this.refreshAllData();
  }

  // ===========================================================================
  // CLIENT ACTIONS
  // ===========================================================================
  setTab(tab: PortalFilterTab): void {
    this.activeTab.set(tab);
  }

  isPast(apt: AppointmentRecord): boolean {
    return this.catalogService.isPastAppointment(apt);
  }

  canCancel(apt: AppointmentRecord): boolean {
    return this.catalogService.canCancelAppointment(apt);
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

  // ===========================================================================
  // BARBER DASHBOARD ACTIONS
  // ===========================================================================
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

    // If marked as NO_SHOW, also record client in the Blacklist
    if (status === 'NO_SHOW' && apt.source !== 'BLOCKED') {
      this.catalogService.addToBlacklist({
        clientName: `${apt.clientLastName} ${apt.clientFirstName}`,
        clientPhone: apt.clientPhone,
        clientEmail: apt.clientEmail,
        reason: `Neprezentare la ${apt.barberName} pe ${apt.dateLabel} la ${apt.startTime}`,
        addedBy: apt.barberName,
      });
    }

    this.refreshAllData();

    const labels: Record<AppointmentRecord['status'], string> = {
      COMPLETED: 'marcată ca Finalizată',
      NO_SHOW: 'marcată ca Neprezentare și adăugată în Blacklist',
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

  // Opens "+ Adaugă Programare (Telefonică)" modal
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
    const firstName = nameParts.slice(1).join(' ') || 'Telefonic';

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
      clientEmail: 'telefon@gangstyle.ro',
      clientPhone: val.clientPhone.trim(),
      notes: val.notes.trim() || 'Programare telefonică',
      source: 'PHONE',
    });

    this.phoneModalOpen.set(false);
    this.refreshAllData();
    this.showFeedback(
      `Programarea telefonică pentru ${val.clientName} (${slot.label}) a fost adăugată și ora a fost ocupată pe site!`
    );
  }

  // Opens "Blochează Interval / Zi liberă" modal
  openBlockModal(): void {
    const days = this.workingDays();
    const defaultDateIso =
      this.barberDateFilter() !== 'ALL'
        ? this.barberDateFilter()
        : (days[0]?.iso ?? '');

    this.blockIntervalForm.reset({
      blockType: 'INTERVAL',
      dateIso: defaultDateIso,
      startTime: '13:00',
      endTime: '14:00',
      reason: 'Pauză de masă',
    });
    this.blockFormSubmitted.set(false);
    this.blockModalOpen.set(true);
  }

  closeBlockModal(): void {
    this.blockModalOpen.set(false);
  }

  setBlockType(type: 'INTERVAL' | 'FULL_DAY'): void {
    this.blockIntervalForm.controls.blockType.setValue(type);
    if (type === 'FULL_DAY') {
      this.blockIntervalForm.controls.startTime.setValue('10:00');
      this.blockIntervalForm.controls.endTime.setValue('19:00');
      this.blockIntervalForm.controls.reason.setValue('Zi liberă / Concediu');
    } else {
      this.blockIntervalForm.controls.startTime.setValue('13:00');
      this.blockIntervalForm.controls.endTime.setValue('14:00');
      this.blockIntervalForm.controls.reason.setValue('Pauză de masă');
    }
  }

  submitBlockInterval(): void {
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
    const endTime = val.blockType === 'FULL_DAY' ? '19:00' : val.endTime;

    this.catalogService.blockTimeInterval({
      barberSlug: barber.slug,
      barberName: barber.name,
      barberPhotoUrl: barber.photoUrl,
      dateIso: val.dateIso,
      dateLabel: this.formatIsoToRoLabel(val.dateIso),
      startTime,
      endTime,
      reason: val.reason.trim(),
    });

    this.blockModalOpen.set(false);
    this.refreshAllData();
    this.showFeedback(
      val.blockType === 'FULL_DAY'
        ? `Ziua (${this.formatIsoToRoLabel(val.dateIso)}) a fost blocată complet pentru ${barber.name}.`
        : `Intervalul ${startTime} - ${endTime} a fost blocat pentru ${barber.name}.`
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
      this.catalogService.updateServicePackage(editId, {
        name: val.name,
        durationMinutes: Number(val.durationMinutes),
        priceRon: Number(val.priceRon),
      });
      this.showFeedback(
        `Serviciul „${val.name}” (${val.priceRon} RON) a fost actualizat pe site!`
      );
    } else {
      this.catalogService.addServicePackage({
        barberTarget: this.selectedBarberSlug(),
        name: val.name,
        durationMinutes: Number(val.durationMinutes),
        priceRon: Number(val.priceRon),
      });
      this.showFeedback(
        `Pachetul nou „${val.name}” (${val.priceRon} RON) a fost adăugat pentru ${this.currentBarber()?.name}!`
      );
    }

    this.closeBarberServiceModal();
    this.refreshAllData();
  }

  deleteBarberService(service: ServiceItem): void {
    const ok = this.catalogService.deleteServicePackage(service.id);
    if (ok) {
      this.refreshAllData();
      this.showFeedback(`Serviciul „${service.name}” a fost șters.`);
    }
  }

  closeAllModals(): void {
    this.closeCancelModal();
    this.closePhoneBookingModal();
    this.closeBlockModal();
    this.closeBarberServiceModal();
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
