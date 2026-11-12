import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceCatalogService } from '../../../core/services/service-catalog.service';
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
  imports: [RouterLink, ReactiveFormsModule],
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
  readonly feedbackMessage = signal<string | null>(null);

  // Service CRUD modal state
  readonly serviceModalOpen = signal(false);
  readonly editingServiceId = signal<string | null>(null);
  readonly serviceFormSubmitted = signal(false);

  // Blacklist modal state
  readonly blacklistModalOpen = signal(false);
  readonly blacklistFormSubmitted = signal(false);

  // Filtered services by barber tab
  readonly filteredServices = computed<ServiceItem[]>(() => {
    const filter = this.barberFilter();
    const list = this.services();
    if (filter === 'ALL') {
      return list;
    }
    return list.filter((s) => s.barberSlug === filter);
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
    durationMinutes: [45, [Validators.required, Validators.min(15)]],
    priceRon: [60, [Validators.required, Validators.min(10)]],
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
      if (user.role !== 'ADMIN') {
        this.router.navigate(['/dashboard']);
        return;
      }
    }
    this.refreshData();
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

  deleteService(service: ServiceItem): void {
    this.catalogService.deleteServiceApi(service.id).subscribe({
      next: () => {
        this.loadServices();
        this.showFeedback(`Pachetul „${service.name}” a fost șters din baza de date.`);
      },
      error: (err) => {
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
    this.closeBlacklistModal();
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
