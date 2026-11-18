import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceCatalogService } from '../../../core/services/service-catalog.service';
import { TwoFactorModal } from '../../../shared/components/two-factor-modal/two-factor-modal';
import {
  AppointmentRecord,
  BlacklistEntry,
  ServiceItem,
} from '../../../shared/models/service-item.model';

export type AdminBarberFilter = 'ALL' | 'filip' | 'sebi';

// Admin Dashboard (/admin):
// 1. Full CRUD on Service Packages & Prices (Create, Read, Update, Delete for Filip & Sebi)
// 2. Anti-No-Show Blacklist management
// 3. Global Salon KPIs
@Component({
  selector: 'app-admin',
  imports: [RouterLink, ReactiveFormsModule, TwoFactorModal],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  host: {
    '(document:keydown.escape)': 'closeModals()',
  },
})
export class Admin implements OnInit {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(ServiceCatalogService);
  readonly authService = inject(AuthService);

  // State signals
  readonly services = signal<ServiceItem[]>([]);
  readonly isLoadingServices = signal(true);
  readonly servicesError = signal<string | null>(null);
  readonly appointments = signal<AppointmentRecord[]>([]);
  readonly blacklist = signal<BlacklistEntry[]>([]);
  readonly barberFilter = signal<AdminBarberFilter>('ALL');
  readonly adminTimeFilter = signal<'TODAY' | 'TOMORROW' | 'MONTH' | 'ALL'>('TODAY');
  readonly adminSearchQuery = signal<string>('');
  readonly appointmentToDelete = signal<AppointmentRecord | null>(null);
  readonly feedbackMessage = signal<string | null>(null);

  // Service CRUD modal state
  readonly serviceModalOpen = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceFormSubmitted = signal(false);
  readonly serviceToDelete = signal<ServiceItem | null>(null);

  // Blacklist modal state
  readonly blacklistModalOpen = signal(false);
  readonly blacklistFormSubmitted = signal(false);
  readonly twoFactorModalOpen = signal(false);

  // Helper date generators for filtering
  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  readonly todayIso = computed(() => this.toIsoDate(new Date()));
  readonly tomorrowIso = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return this.toIsoDate(d);
  });
  readonly currentMonthPrefix = computed(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Filtered services by barber tab
  readonly filteredServices = computed<ServiceItem[]>(() => {
    const filter = this.barberFilter();
    const list = this.services();
    if (filter === 'ALL') {
      return list;
    }
    return list.filter((s) => s.barberSlug === filter);
  });

  // Filtered appointments by barber, time tab, and search query
  readonly filteredAppointments = computed<AppointmentRecord[]>(() => {
    const timeFilter = this.adminTimeFilter();
    const barber = this.barberFilter();
    const today = this.todayIso();
    const tomorrow = this.tomorrowIso();
    const month = this.currentMonthPrefix();
    const query = this.adminSearchQuery().trim().toLowerCase();

    return this.appointments()
      .filter((apt) => {
        if (apt.source === 'BLOCKED' || apt.status === 'CANCELLED') {
          return false;
        }
        if (barber !== 'ALL' && apt.barberSlug !== barber) {
          return false;
        }
        if (timeFilter === 'TODAY' && apt.dateIso !== today) {
          return false;
        }
        if (timeFilter === 'TOMORROW' && apt.dateIso !== tomorrow) {
          return false;
        }
        if (timeFilter === 'MONTH' && !apt.dateIso.startsWith(month)) {
          return false;
        }
        if (query.length > 0) {
          const matchClient = `${apt.clientLastName} ${apt.clientFirstName}`.toLowerCase().includes(query);
          const matchPhone = apt.clientPhone.toLowerCase().includes(query);
          const matchService = apt.serviceName.toLowerCase().includes(query);
          if (!matchClient && !matchPhone && !matchService) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const dateDiff = a.dateIso.localeCompare(b.dateIso);
        if (dateDiff !== 0) return dateDiff;
        return a.startTime.localeCompare(b.startTime);
      });
  });

  // Global salon KPIs
  readonly totalActiveAppointments = computed<number>(
    () =>
      this.appointments().filter(
        (a) =>
          a.source !== 'BLOCKED' &&
          (a.status === 'CONFIRMED' || a.status === 'COMPLETED')
      ).length
  );

  // Reactive form for Service Package CRUD
  readonly serviceForm = this.fb.nonNullable.group({
    barberTarget: ['both' as 'filip' | 'sebi' | 'both', [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    durationMinutes: [45, [Validators.required, Validators.min(5)]],
    priceRon: [60, [Validators.required, Validators.min(5)]],
  });

  // Reactive form for adding a client to the Anti-No-Show Blacklist
  readonly blacklistForm = this.fb.nonNullable.group({
    clientName: ['', [Validators.required, Validators.minLength(2)]],
    clientPhone: ['', [Validators.required, Validators.pattern(/^[0-9\s+]{9,14}$/)]],
    reason: ['Neprezentare repetată fără anulare', [Validators.required]],
  });

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (typeof window !== 'undefined') {
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      // Restrict /admin strictly to ADMIN role
      if (!this.authService.isAdmin(user)) {
        this.router.navigate(['/dashboard']);
        return;
      }
    }
    this.refreshData();
  }

  setAdminTimeFilter(filter: 'TODAY' | 'TOMORROW' | 'MONTH' | 'ALL'): void {
    this.adminTimeFilter.set(filter);
  }

  onAdminSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.adminSearchQuery.set(val);
  }

  openDeleteModal(apt: AppointmentRecord): void {
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
      this.refreshData();
      this.showFeedback(
        `Programarea pentru ${target.clientLastName} ${target.clientFirstName} (${target.startTime} - ${target.endTime}) a fost ștearsă, iar intervalul a fost eliberat.`
      );
    }
  }

  refreshData(): void {
    this.loadServices();
    this.appointments.set(this.catalogService.getAllAppointments());
    this.blacklist.set(this.catalogService.getBlacklist());
  }

  loadServices(): void {
    this.isLoadingServices.set(true);
    this.servicesError.set(null);

    this.catalogService.fetchAllServices().subscribe({
      next: (data) => {
        this.services.set(data);
        this.isLoadingServices.set(false);
      },
      error: () => {
        this.servicesError.set(
          'Nu am putut încărca serviciile din server. Verifică dacă backend-ul este pornit.'
        );
        this.isLoadingServices.set(false);
      },
    });
  }

  setBarberFilter(filter: AdminBarberFilter): void {
    this.barberFilter.set(filter);
  }

  // Opens modal for adding a new service or editing an existing one
  openServiceModal(service?: ServiceItem): void {
    this.serviceFormSubmitted.set(false);
    if (service) {
      this.editingServiceId.set(service.id);
      this.serviceForm.reset({
        barberTarget: service.barberSlug as 'filip' | 'sebi',
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceRon: service.priceRon,
      });
    } else {
      this.editingServiceId.set(null);
      const defaultTarget =
        this.barberFilter() === 'ALL' ? 'both' : this.barberFilter();
      this.serviceForm.reset({
        barberTarget: defaultTarget as 'filip' | 'sebi' | 'both',
        name: '',
        durationMinutes: 45,
        priceRon: 60,
      });
    }
    this.serviceModalOpen.set(true);
  }

  closeServiceModal(): void {
    this.serviceModalOpen.set(false);
    this.editingServiceId.set(null);
  }

  submitServiceForm(): void {
    this.serviceFormSubmitted.set(true);
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const val = this.serviceForm.getRawValue();
    const editId = this.editingServiceId();

    if (editId) {
      const existing = this.services().find((s) => s.id === editId);
      const barberSlug =
        existing?.barberSlug ?? (val.barberTarget === 'sebi' ? 'sebi' : 'filip');

      this.catalogService
        .updateServiceApi(editId, {
          barberSlug,
          name: val.name,
          durationMinutes: Number(val.durationMinutes),
          priceRon: Number(val.priceRon),
        })
        .subscribe({
          next: () => {
            this.closeServiceModal();
            this.loadServices();
            this.showFeedback(
              `Pachetul „${val.name}” · ${val.priceRon} RON a fost actualizat în baza de date!`
            );
          },
          error: (err) => {
            this.showFeedback(this.extractErrorMessage(err));
          },
        });
    } else {
      this.catalogService
        .createServiceApi({
          barberTarget: val.barberTarget,
          name: val.name,
          durationMinutes: Number(val.durationMinutes),
          priceRon: Number(val.priceRon),
        })
        .subscribe({
          next: () => {
            this.closeServiceModal();
            this.loadServices();
            this.showFeedback(
              `Pachetul nou „${val.name}” · ${val.priceRon} RON a fost salvat în MongoDB!`
            );
          },
          error: (err) => {
            this.showFeedback(this.extractErrorMessage(err));
          },
        });
    }
  }

  // Opens confirmation modal before deleting a service package.
  openDeleteServiceModal(service: ServiceItem): void {
    this.serviceToDelete.set(service);
  }

  closeDeleteServiceModal(): void {
    this.serviceToDelete.set(null);
  }

  // Deletes the selected service package after modal confirmation.
  confirmDeleteService(): void {
    const target = this.serviceToDelete();
    if (!target) {
      return;
    }

    this.catalogService.deleteServiceApi(target.id).subscribe({
      next: () => {
        this.serviceToDelete.set(null);
        this.loadServices();
        this.showFeedback(`Pachetul „${target.name}” a fost șters din baza de date.`);
      },
      error: (err) => {
        this.serviceToDelete.set(null);
        this.showFeedback(this.extractErrorMessage(err));
      },
    });
  }

  private extractErrorMessage(err: any): string {
    const apiBody = err?.error;
    if (apiBody?.fieldErrors) {
      const firstError = Object.values(apiBody.fieldErrors)[0];
      if (typeof firstError === 'string') {
        return firstError;
      }
    }
    if (typeof apiBody?.message === 'string' && apiBody.message.trim().length > 0) {
      return apiBody.message;
    }
    return 'Operațiunea nu a putut fi salvată. Verifică conexiunea cu serverul.';
  }

  // Blacklist modal & actions
  openBlacklistModal(): void {
    this.blacklistFormSubmitted.set(false);
    this.blacklistForm.reset({
      clientName: '',
      clientPhone: '',
      reason: 'Neprezentare repetată fără anulare',
    });
    this.blacklistModalOpen.set(true);
  }

  closeBlacklistModal(): void {
    this.blacklistModalOpen.set(false);
  }

  submitBlacklistForm(): void {
    this.blacklistFormSubmitted.set(true);
    if (this.blacklistForm.invalid) {
      this.blacklistForm.markAllAsTouched();
      return;
    }

    const val = this.blacklistForm.getRawValue();
    this.catalogService.addToBlacklist({
      clientName: val.clientName,
      clientPhone: val.clientPhone,
      reason: val.reason,
      addedBy: 'Admin',
    });

    this.closeBlacklistModal();
    this.refreshData();
    this.showFeedback(
      `Clientul ${val.clientName} a fost adăugat în lista Blacklist.`
    );
  }

  unblockClient(entry: BlacklistEntry): void {
    const ok = this.catalogService.removeFromBlacklist(entry.id);
    if (ok) {
      this.refreshData();
      this.showFeedback(
        `Clientul ${entry.clientName} a fost scos din Blacklist.`
      );
    }
  }

  closeModals(): void {
    this.closeServiceModal();
    this.closeDeleteServiceModal();
    this.closeBlacklistModal();
    this.closeDeleteModal();
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
}
