import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ReferralTrackingService } from '../../../core/services/referral-tracking.service';
import { ServiceCatalogService } from '../../../core/services/service-catalog.service';
import { TwoFactorModal } from '../../../shared/components/two-factor-modal/two-factor-modal';
import {
  AppointmentRecord,
  BlacklistEntry,
  ServiceItem,
} from '../../../shared/models/service-item.model';

import { BarberService } from '../../../core/services/barber.service';
import { ErrorHandlerService } from '../../../core/services/error-handler.service';
import { Barber } from '../../../shared/models/barber.model';

export type AdminBarberFilter = 'ALL' | string;
export type AdminSectionTab = 'STATS' | 'CRM' | 'SCHEDULE' | 'SERVICES' | 'BLACKLIST';
export type CrmFilterOption = 'ALL' | 'NEW' | 'RETURNING' | 'REFERRAL';

export interface CrmClientRecord {
  phoneKey: string;
  fullName: string;
  clientFirstName: string;
  clientLastName: string;
  phone: string;
  email: string;
  bookingsCount: number;
  isReturning: boolean;
  favoriteBarberSlug: string;
  favoriteBarberName: string;
  referralSource: string;
  referralLabel: string;
  referralCode?: string;
  totalSpentRon: number;
  lastDateIso: string;
  lastDateLabel: string;
}

export interface BarberMetricSummary {
  slug: string;
  name: string;
  photoUrl: string;
  weeklyCount: number;
  monthlyCount: number;
  totalCount: number;
  newClientsCount: number;
  returningClientsCount: number;
  totalRevenueRon: number;
  sharePercent: number;
}

export interface ReferralSourceMetric {
  key: string;
  label: string;
  icon: string;
  count: number;
  percent: number;
}

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
  private readonly barberService = inject(BarberService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly referralTracking = inject(ReferralTrackingService);
  readonly authService = inject(AuthService);

  // Active admin section tab
  readonly activeAdminSection = signal<AdminSectionTab>('STATS');
  readonly Math = Math;

  // CRM Search & Filter state
  readonly crmFilter = signal<CrmFilterOption>('ALL');
  readonly crmSearchQuery = signal<string>('');
  readonly shareableLinks = computed(() => {
    const barberList = this.barbers().map((b) => ({ name: b.name, slug: b.slug }));
    return this.referralTracking.getShareableLinks(undefined, barberList.length > 0 ? barberList : undefined);
  });

  // State signals
  readonly barbers = signal<Barber[]>([]);
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

  // =========================================================================
  // COMPUTED BUSINESS METRICS & TIME BOUNDARIES
  // =========================================================================

  /**
   * Computes the ISO date string (YYYY-MM-DD) for Monday of the current calendar week.
   * Used as the lower bound when calculating weekly appointments per barber.
   */
  readonly currentWeekStartIso = computed<string>(() => {
    const d = new Date();
    const day = d.getDay();
    // In JavaScript, Sunday is 0; shift Monday to be day 1 (diff = -6 if Sunday, else 1 - day)
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return this.toIsoDate(monday);
  });

  /**
   * Computes the ISO date string (YYYY-MM-DD) for Sunday of the current calendar week.
   * Used as the upper bound when calculating weekly appointments per barber.
   */
  readonly currentWeekEndIso = computed<string>(() => {
    const d = new Date();
    const day = d.getDay();
    // Sunday is day 0; if not Sunday, add days until the upcoming Sunday
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    const sunday = new Date(d);
    sunday.setDate(diff);
    return this.toIsoDate(sunday);
  });

  /**
   * Filters out internal blocked intervals and cancelled bookings,
   * leaving only active, valid client appointments for accurate business metrics.
   */
  readonly validAppointments = computed<AppointmentRecord[]>(() =>
    this.appointments().filter((a) => a.source !== 'BLOCKED' && a.status !== 'CANCELLED')
  );

  /**
   * Aggregates total salon revenue in RON across all confirmed or completed appointments.
   */
  readonly totalRevenueRon = computed<number>(() =>
    this.validAppointments().reduce((sum, a) => sum + (Number(a.priceRon) || 0), 0)
  );

  /**
   * Computes per-barber performance metrics dynamically for all registered barbers:
   * - Weekly & monthly appointment count
   * - Client retention: New clients (1st visit) vs. Returning loyal clients (2+ visits)
   * - Total revenue generated per barber chair
   * - Salon market share percentage
   */
  readonly barberStatsList = computed<BarberMetricSummary[]>(() => {
    const all = this.validAppointments();
    const barbers = this.barbers();
    const totalSalonCount = all.length || 1;
    const weekStart = this.currentWeekStartIso();
    const weekEnd = this.currentWeekEndIso();
    const month = this.currentMonthPrefix();

    return barbers.map((b) => {
      const slug = b.slug.toLowerCase();
      // Match appointments belonging to this barber
      const bApts = all.filter((a) => (a.barberSlug || '').toLowerCase() === slug);

      // Current week appointment volume (Monday through Sunday)
      const weeklyCount = bApts.filter(
        (a) => a.dateIso >= weekStart && a.dateIso <= weekEnd
      ).length;

      // Current month appointment volume (matching YYYY-MM prefix)
      const monthlyCount = bApts.filter((a) => a.dateIso.startsWith(month)).length;

      // Accumulated revenue generated by this barber's chair
      const totalRevenueRon = bApts.reduce((sum, a) => sum + (Number(a.priceRon) || 0), 0);

      // Client retention calculation:
      // Group appointments by normalized phone number to determine repeat booking frequency
      const clientMap = new Map<string, number>();
      for (const a of bApts) {
        const phone = (a.clientPhone || '').replace(/\s+/g, '');
        if (phone) {
          clientMap.set(phone, (clientMap.get(phone) || 0) + 1);
        }
      }

      let newCount = 0;
      let retCount = 0;
      clientMap.forEach((count) => {
        if (count >= 2) {
          retCount++; // Client with 2 or more bookings is classified as returning/loyal
        } else {
          newCount++; // Client with exactly 1 booking is classified as new
        }
      });

      // Percentage share of total salon appointments
      const sharePercent = Math.round((bApts.length / totalSalonCount) * 100);

      return {
        slug: b.slug,
        name: b.name,
        photoUrl: b.photoUrl,
        weeklyCount,
        monthlyCount,
        totalCount: bApts.length,
        newClientsCount: newCount,
        returningClientsCount: retCount,
        totalRevenueRon,
        sharePercent,
      };
    });
  });

  /**
   * Analyzes marketing and acquisition channels:
   * Categorizes valid appointments by referral source (WhatsApp, Instagram, Friends, Direct Google, Phone).
   */
  readonly referralSourceMetrics = computed<ReferralSourceMetric[]>(() => {
    const list = this.validAppointments();
    const total = list.length || 1;

    let whatsapp = 0;
    let instagram = 0;
    let maps = 0;
    let friend = 0;
    let phone = 0;
    let direct = 0;

    for (const a of list) {
      const ref = (a.referralSource || '').toUpperCase();
      const src = (a.source || '').toUpperCase();

      if (ref === 'WHATSAPP_SHARE' || ref.includes('WHATSAPP')) {
        whatsapp++;
      } else if (ref === 'INSTAGRAM_BIO' || ref.includes('INSTAGRAM')) {
        instagram++;
      } else if (ref === 'GOOGLE_MAPS' || ref.includes('MAPS')) {
        maps++;
      } else if (ref === 'FRIEND_REF' || ref.includes('FRIEND') || ref === 'REF_CODE') {
        friend++;
      } else if (ref === 'PHONE_CALL' || src === 'PHONE') {
        phone++;
      } else {
        direct++;
      }
    }

    return [
      {
        key: 'GOOGLE_MAPS',
        label: 'Google Maps & Business',
        icon: '📍',
        count: maps,
        percent: Math.round((maps / total) * 100),
      },
      {
        key: 'WHATSAPP_SHARE',
        label: 'Recomandare WhatsApp',
        icon: '💬',
        count: whatsapp,
        percent: Math.round((whatsapp / total) * 100),
      },
      {
        key: 'INSTAGRAM_BIO',
        label: 'Instagram Bio / Story',
        icon: '📸',
        count: instagram,
        percent: Math.round((instagram / total) * 100),
      },
      {
        key: 'FRIEND_REF',
        label: 'Recomandare Prieteni / Cod',
        icon: '🤝',
        count: friend,
        percent: Math.round((friend / total) * 100),
      },
      {
        key: 'PHONE_CALL',
        label: 'Programare Telefonică',
        icon: '📞',
        count: phone,
        percent: Math.round((phone / total) * 100),
      },
      {
        key: 'DIRECT_ORGANIC',
        label: 'Direct / Căutare Google',
        icon: '🌐',
        count: direct,
        percent: Math.round((direct / total) * 100),
      },
    ];
  });

  readonly totalReferralsCount = computed<number>(() => {
    const metrics = this.referralSourceMetrics();
    return metrics
      .filter((m) => m.key !== 'DIRECT_ORGANIC')
      .reduce((sum, m) => sum + m.count, 0);
  });

  readonly totalDirectCount = computed<number>(() => {
    const directMetric = this.referralSourceMetrics().find((m) => m.key === 'DIRECT_ORGANIC');
    return directMetric ? directMetric.count : 0;
  });

  /**
   * Builds the comprehensive Client CRM dataset:
   * 1. Groups all appointment records by unique client phone number or email.
   * 2. Sorts each client's history descending by date to identify their latest visit.
   * 3. Calculates Customer Lifetime Value (total spent in RON).
   * 4. Identifies preferred barber by tallying appointment counts.
   * 5. Preserves original referral attribution from the client's first visit.
   */
  readonly crmClients = computed<CrmClientRecord[]>(() => {
    const apts = this.validAppointments();
    const clientMap = new Map<string, AppointmentRecord[]>();

    for (const a of apts) {
      const key = (a.clientPhone || a.clientEmail || `${a.clientLastName}_${a.clientFirstName}`)
        .replace(/\s+/g, '')
        .toLowerCase();
      if (!key) continue;
      const existing = clientMap.get(key) || [];
      existing.push(a);
      clientMap.set(key, existing);
    }

    const records: CrmClientRecord[] = [];

    clientMap.forEach((userApts, phoneKey) => {
      // Sort appointments descending by date to extract latest visit metadata
      const sorted = [...userApts].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
      const latest = sorted[0];

      const count = userApts.length;
      const totalSpent = userApts.reduce((sum, a) => sum + (Number(a.priceRon) || 0), 0);

      // Determine the client's favorite barber based on appointment frequency
      const barberTally: Record<string, number> = {};
      userApts.forEach((a) => {
        const slug = (a.barberSlug || 'filip').toLowerCase();
        barberTally[slug] = (barberTally[slug] || 0) + 1;
      });

      let favSlug = 'filip';
      let maxB = 0;
      Object.entries(barberTally).forEach(([slug, c]) => {
        if (c > maxB) {
          maxB = c;
          favSlug = slug;
        }
      });

      // Find first known referral source for accurate historical attribution
      const withRef = userApts.find(
        (a) => a.referralSource && a.referralSource !== 'DIRECT_ORGANIC'
      );
      const referralSource = withRef?.referralSource || latest?.referralSource || 'DIRECT_ORGANIC';
      const referralLabel = withRef?.referralLabel || latest?.referralLabel || 'Direct / Căutare Google';

      records.push({
        phoneKey,
        fullName: `${latest.clientLastName} ${latest.clientFirstName}`.trim(),
        clientFirstName: latest.clientFirstName,
        clientLastName: latest.clientLastName,
        phone: latest.clientPhone,
        email: latest.clientEmail,
        bookingsCount: count,
        isReturning: count >= 2,
        favoriteBarberSlug: favSlug,
        favoriteBarberName: this.getBarberName(favSlug),
        referralSource,
        referralLabel,
        referralCode: withRef?.referralCode || latest?.referralCode,
        totalSpentRon: totalSpent,
        lastDateIso: latest.dateIso,
        lastDateLabel: latest.dateLabel,
      });
    });

    // Sort CRM client list by most recent booking date
    return records.sort((a, b) => b.lastDateIso.localeCompare(a.lastDateIso));
  });

  /**
   * Applies active CRM filter tabs (All, New, Returning, Referral) and text search.
   */
  readonly filteredCrmClients = computed<CrmClientRecord[]>(() => {
    const list = this.crmClients();
    const filter = this.crmFilter();
    const query = this.crmSearchQuery().trim().toLowerCase();

    return list.filter((c) => {
      // Filter by client type / referral status
      if (filter === 'NEW' && c.isReturning) return false;
      if (filter === 'RETURNING' && !c.isReturning) return false;
      if (filter === 'REFERRAL' && c.referralSource === 'DIRECT_ORGANIC') return false;

      // Multi-field text search matching name, phone, email, barber, or referral label
      if (query) {
        const matchName = c.fullName.toLowerCase().includes(query);
        const matchPhone = c.phone.toLowerCase().includes(query);
        const matchEmail = c.email.toLowerCase().includes(query);
        const matchBarber = c.favoriteBarberName.toLowerCase().includes(query);
        const matchRef = c.referralLabel.toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchEmail && !matchBarber && !matchRef) {
          return false;
        }
      }
      return true;
    });
  });

  readonly totalNewClients = computed<number>(() =>
    this.crmClients().filter((c) => !c.isReturning).length
  );

  readonly totalReturningClients = computed<number>(() =>
    this.crmClients().filter((c) => c.isReturning).length
  );

  setActiveAdminSection(section: AdminSectionTab): void {
    this.activeAdminSection.set(section);
  }

  setCrmFilter(filter: CrmFilterOption): void {
    this.crmFilter.set(filter);
  }

  onCrmSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.crmSearchQuery.set(val);
  }

  readonly copiedLinkKey = signal<string | null>(null);

  copyShareLink(url: string, label: string, key?: string): void {
    if (key) {
      this.copiedLinkKey.set(key);
      setTimeout(() => {
        if (this.copiedLinkKey() === key) {
          this.copiedLinkKey.set(null);
        }
      }, 2000);
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => {
          this.showFeedback(`✓ Linkul pentru ${label} a fost copiat în clipboard!`);
        },
        () => {
          this.showFeedback(`Link copiat: ${url}`);
        }
      );
    } else {
      this.showFeedback(`Link: ${url}`);
    }
  }

  // Reactive form for Service Package CRUD
  readonly serviceForm = this.fb.nonNullable.group({
    barberTarget: ['both', [Validators.required]],
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

  getBarberName(slug?: string): string {
    if (!slug) return '';
    const clean = slug.trim().toLowerCase();
    const found = this.barbers().find((b) => b.slug.toLowerCase() === clean);
    return found ? found.name : slug.charAt(0).toUpperCase() + slug.slice(1);
  }

  getBarberPhoto(slug?: string): string {
    if (!slug) return '/images/gangstyle.jpg';
    const clean = slug.trim().toLowerCase();
    const found = this.barbers().find((b) => b.slug.toLowerCase() === clean);
    return found?.photoUrl || '/images/gangstyle.jpg';
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (typeof window !== 'undefined') {
      // Security Layer 2 (Component-level defense-in-depth):
      // Even if route guard passes, verify session authenticity before initializing any admin data.
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      // Strict role enforcement: Only ROLE_ADMIN may view salon-wide metrics, CRM, or revenue.
      // Barbers (Filip & Sebi) are redirected to their chair /dashboard.
      // Regular clients who stumble onto /admin are safely redirected to the homepage (/).
      if (!this.authService.isAdmin(user)) {
        if (this.authService.isBarber(user)) {
          this.router.navigate(['/dashboard']);
        } else {
          this.router.navigate(['/']);
        }
        return;
      }
    }
    this.barberService.getAll().subscribe({
      next: (list) => this.barbers.set(list),
    });
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
        barberTarget: service.barberSlug,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceRon: service.priceRon,
      });
    } else {
      this.editingServiceId.set(null);
      const defaultTarget =
        this.barberFilter() === 'ALL' ? 'both' : this.barberFilter();
      this.serviceForm.reset({
        barberTarget: defaultTarget,
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
        existing?.barberSlug ?? (val.barberTarget !== 'both' ? val.barberTarget : (this.barbers()[0]?.slug || ''));

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
    const appError = this.errorHandler.handleAdminPortalError(err);
    if (appError.fieldErrors) {
      const firstError = Object.values(appError.fieldErrors)[0];
      if (typeof firstError === 'string') {
        return firstError;
      }
    }
    return appError.message;
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
    const ok = this.catalogService.unblockClient(entry.clientPhone || entry.id);
    if (ok) {
      this.refreshData();
      this.showFeedback(
        `Clientul ${entry.clientName} a fost deblocat. Are acces din nou la programări online.`
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
