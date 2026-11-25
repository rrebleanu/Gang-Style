import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { BarberService } from '../../core/services/barber.service';
import { AuthService } from '../../core/services/auth.service';
import { ClientStorageService } from '../../core/services/client-storage.service';
import { ErrorHandlerService } from '../../core/services/error-handler.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { AppError } from '../../core/errors/app-error.model';
import { ReferralTrackingService } from '../../core/services/referral-tracking.service';
import { Barber } from '../../shared/models/barber.model';
import { AppointmentRecord, ServiceItem, TimeSlot } from '../../shared/models/service-item.model';

export interface CalendarDayOption {
  iso: string; // YYYY-MM-DD
  dayName: string; // e.g. Joi
  dayNumber: string; // e.g. 12 Nov
  fullLabel: string; // e.g. Joi, 12 Noiembrie
}

// Multi-step barber booking page (/:slug -> /filip, /sebi).
@Component({
  selector: 'app-booking',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './booking.html',
  styleUrl: './booking.scss',
  host: {
    '(document:keydown.escape)': 'closeGallery()',
    '(document:keydown.arrowleft)': 'onArrowKey(-1)',
    '(document:keydown.arrowright)': 'onArrowKey(1)',
  },
})
export class Booking implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly barberService = inject(BarberService);
  private readonly catalogService = inject(ServiceCatalogService);
  private readonly clientStorage = inject(ClientStorageService);
  private readonly referralTracking = inject(ReferralTrackingService);
  private readonly errorHandler = inject(ErrorHandlerService);
  readonly authService = inject(AuthService);

  // Active barber and their service packages
  readonly barber = signal<Barber | null>(null);
  readonly services = signal<ServiceItem[]>([]);
  readonly activeSlug = signal<string>('');
  readonly isLoadingData = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly bookingError = signal<AppError | null>(null);

  // Real-time availability slots state fetched from GET /api/availability
  readonly timeSlots = signal<TimeSlot[]>([]);
  readonly isLoadingSlots = signal(false);
  readonly slotsError = signal<AppError | null>(null);

  // Booking HTTP submission state for POST /api/appointments
  readonly isSubmittingBooking = signal(false);
  readonly confirmedAppointment = signal<AppointmentRecord | null>(null);

  // Wizard step: 1 = Service, 2 = Date & Time, 3 = Personal Details, 4 = Summary
  readonly currentStep = signal<1 | 2 | 3 | 4>(1);

  // Selections
  readonly selectedService = signal<ServiceItem | null>(null);
  readonly availableDays = signal<CalendarDayOption[]>([]);
  readonly selectedDateIso = signal<string>('');
  readonly selectedSlot = signal<TimeSlot | null>(null);

  // Booking completion state
  readonly isConfirmed = signal(false);
  readonly linkCopied = signal(false);

  // Lightbox gallery state
  readonly activePhotoIndex = signal<number | null>(null);

  // Step 1 validation hint
  readonly step1Submitted = signal(false);
  // Step 2 validation hint
  readonly step2Submitted = signal(false);
  // Step 3 form submission state
  readonly step3Submitted = signal(false);

  // Extracts structured backend validation field errors (if returned by Spring Boot @Valid)
  readonly bookingFieldErrors = computed<string[]>(() => {
    const err = this.bookingError();
    if (!err?.fieldErrors) {
      return [];
    }
    return Object.values(err.fieldErrors).filter(
      (msg): msg is string => typeof msg === 'string' && msg.trim().length > 0
    );
  });

  readonly selectedDayLabel = computed<string>(() => {
    const iso = this.selectedDateIso();
    const found = this.availableDays().find((d) => d.iso === iso);
    if (found) {
      return found.fullLabel;
    }
    return iso;
  });

  // Strict 14-day rolling booking horizon (today up to 14 calendar days / 2 weeks ahead)
  readonly todayIso = computed<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  readonly maxBookingDateIso = computed<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Anti-no-show blacklist shield state
  readonly isClientPhoneBlocked = signal(false);
  readonly blockedClientReason = signal<string | null>(null);

  // Returning client detection (invisible retention)
  readonly isReturningClient = signal(false);

  // Step 3 reactive form with validators
  readonly clientForm = this.fb.nonNullable.group({
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^(\+?40|0)?[0-9\s-]{8,15}$/)]],
    notes: [''],
    gdprConsent: [false, [Validators.requiredTrue]],
  });

  
  // PWA and Home Screen install state
  readonly showIosGuide = signal(false);
  readonly showAndroidGuide = signal(false);
  readonly pwaInstalled = signal(false);
  private deferredPrompt: any = null;

  normalizeRawPhone(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('0040')) digits = digits.substring(4);
    else if (digits.startsWith('40') && digits.length >= 11) digits = digits.substring(2);
    if (digits.startsWith('0')) digits = digits.substring(1);
    return digits;
  }

  formatPhoneInput(): void {
    const raw = this.clientForm.controls.phone.value;
    if (!raw) return;
    const digits = this.normalizeRawPhone(raw);
    if (digits.length === 9) {
      const formatted = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
      this.clientForm.controls.phone.setValue(formatted, { emitEvent: false });
    }
  }

  displayConfirmedPhone(): string {
    const aptPhone = this.confirmedAppointment()?.clientPhone || this.clientForm.controls.phone.value || '';
    const digits = this.normalizeRawPhone(aptPhone);
    if (digits.length === 9) {
      return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    return aptPhone.startsWith('0') ? aptPhone : `0${aptPhone}`;
  }

  // Detect iOS Safari devices where native beforeinstallprompt is unsupported
  isIosDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }

  // Trigger PWA install prompt or open friendly dark modal instructions
  triggerInstallPrompt(): void {
    if (this.isIosDevice()) {
      this.showIosGuide.set(true);
    } else if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') {
          this.pwaInstalled.set(true);
        }
        this.deferredPrompt = null;
      });
    } else {
      // Open in-app guide modal instead of intrusive browser alert
      this.showAndroidGuide.set(true);
    }
  }

  closeIosGuide(): void {
    this.showIosGuide.set(false);
  }

  closeAndroidGuide(): void {
    this.showAndroidGuide.set(false);
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
      });
    }

    // 1. Check for returning client profile saved safely in localStorage
    const returningClient = this.clientStorage.getClientProfile();
    if (returningClient) {
      if (returningClient.lastName && !this.clientForm.controls.lastName.value) {
        this.clientForm.controls.lastName.setValue(returningClient.lastName);
      }
      if (returningClient.firstName && !this.clientForm.controls.firstName.value) {
        this.clientForm.controls.firstName.setValue(returningClient.firstName);
      }
      if (returningClient.email && !this.clientForm.controls.email.value) {
        this.clientForm.controls.email.setValue(returningClient.email);
      }
      if (returningClient.phone && !this.clientForm.controls.phone.value) {
        const cleanPhone = returningClient.phone.replace(/^\+?40\s?/, '');
        this.clientForm.controls.phone.setValue(cleanPhone);
      }
      this.isReturningClient.set(true);
    }

    // 2. Logged-in user values take precedence if present
    const loggedUser = this.authService.currentUser();
    if (loggedUser) {
      if (loggedUser.email && loggedUser.email.includes('@')) {
        this.clientForm.controls.email.setValue(loggedUser.email);
      }
      if (loggedUser.phone) {
        const cleanPhone = loggedUser.phone.replace(/^\+?40\s?/, '');
        this.clientForm.controls.phone.setValue(cleanPhone);
      }
      if (loggedUser.displayName) {
        const parts = loggedUser.displayName.trim().split(/\s+/);
        if (parts.length >= 2) {
          if (!this.clientForm.controls.lastName.value) {
            this.clientForm.controls.lastName.setValue(parts[0]);
          }
          if (!this.clientForm.controls.firstName.value) {
            this.clientForm.controls.firstName.setValue(parts.slice(1).join(' '));
          }
        } else if (parts.length === 1 && !this.clientForm.controls.lastName.value) {
          this.clientForm.controls.lastName.setValue(parts[0]);
        }
      }
    }

    // Monitor client phone input to detect 2+ no-shows in real-time
    this.clientForm.controls.phone.valueChanges.subscribe((rawPhone) => {
      const digits = (rawPhone || '').replace(/\D/g, '');
      if (digits.length >= 9) {
        const check = this.catalogService.isClientBlocked(rawPhone);
        this.isClientPhoneBlocked.set(check.blocked);
        this.blockedClientReason.set(check.reason ?? null);
      } else {
        this.isClientPhoneBlocked.set(false);
        this.blockedClientReason.set(null);
      }
    });

    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') ?? '';
      this.activeSlug.set(slug);
      const days = this.generateWorkingDays(8, slug);
      this.availableDays.set(days);
      if (days.length > 0) {
        this.selectedDateIso.set(days[0].iso);
      }
      this.loadBarberAndServices(slug);
    });
  }

  loadBarberAndServices(slug: string): void {
    if (!slug) {
      this.router.navigate(['/404']);
      return;
    }

    this.isLoadingData.set(true);
    this.loadError.set(null);

    forkJoin({
      barber: this.barberService.getBySlug(slug),
      services: this.catalogService.fetchServicesByBarber(slug),
    }).subscribe({
      next: ({ barber, services }) => {
        this.barber.set(barber);
        this.services.set(services);
        this.isLoadingData.set(false);

        // If navigated via 1-Click Reschedule (?serviceId=...), pre-select service and jump to Step 2
        const preselectedId = this.route.snapshot.queryParamMap.get('serviceId');
        if (preselectedId) {
          const matchedService = services.find((s) => s.id === preselectedId);
          if (matchedService) {
            this.selectedService.set(matchedService);
            this.currentStep.set(2);
            this.loadRealSlotsForSelectedDate();
          }
        }
      },
      error: (err) => {
        if (err?.status === 404) {
          this.router.navigate(['/404']);
          return;
        }
        const appErr = this.errorHandler.handleBookingError(err);
        this.loadError.set(appErr.message);
        this.isLoadingData.set(false);
      },
    });
  }

  /**
   * Queries GET /api/availability for the currently selected barber, ISO date, and service duration.
   * Seeds an immediate local snapshot to avoid UI layout shifts, then replaces it with the
   * authoritative slot list from the Spring Boot backend and re-validates any selected slot.
   */
  loadRealSlotsForSelectedDate(): void {
    const currentBarber = this.barber();
    const service = this.selectedService();
    const dateIso = this.selectedDateIso();

    if (!currentBarber || !service || !dateIso) {
      this.timeSlots.set([]);
      return;
    }

    this.slotsError.set(null);
    this.isLoadingSlots.set(true);

    // Pre-populate immediate local estimate while the HTTP request is in flight
    this.timeSlots.set(this.catalogService.getSlotsForDate(currentBarber.slug, dateIso, service));

    this.catalogService
      .fetchAvailabilitySlotsApi(currentBarber.slug, dateIso, service)
      .subscribe({
        next: (slots) => {
          this.timeSlots.set(slots);
          this.isLoadingSlots.set(false);

          // If the user's previously selected slot became occupied in the meantime, deselect it
          const currentSelected = this.selectedSlot();
          if (currentSelected) {
            const matching = slots.find((s) => s.startTime === currentSelected.startTime);
            if (!matching || !matching.available) {
              this.selectedSlot.set(null);
            }
          }
        },
        error: (err: unknown) => {
          this.isLoadingSlots.set(false);
          const appErr = this.errorHandler.handleBookingError(err);
          this.slotsError.set(appErr);
        },
      });
  }

  // Step 1 actions
  selectService(item: ServiceItem): void {
    const previous = this.selectedService();
    this.selectedService.set(item);
    this.step1Submitted.set(false);

    // Reset selected time slot if duration changed
    if (!previous || previous.durationMinutes !== item.durationMinutes) {
      this.selectedSlot.set(null);
    }

    this.loadRealSlotsForSelectedDate();
  }

  goToStep2(): void {
    this.step1Submitted.set(true);
    if (!this.selectedService()) {
      return;
    }
    this.currentStep.set(2);
    this.loadRealSlotsForSelectedDate();
    this.scrollToTop();
  }

  // Step 2 actions
  selectDate(iso: string): void {
    const minIso = this.todayIso();
    const maxIso = this.maxBookingDateIso();
    // Enforce 14-day booking horizon: reject dates in the past or beyond 14 days (2 weeks)
    if (iso < minIso || iso > maxIso) {
      return;
    }
    this.selectedDateIso.set(iso);
    this.selectedSlot.set(null);
    this.loadRealSlotsForSelectedDate();
  }

  onNativeDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.selectDate(input.value);
    }
  }

  selectTimeSlot(slot: TimeSlot): void {
    if (!slot.available) {
      return;
    }
    this.selectedSlot.set(slot);
    this.step2Submitted.set(false);
  }

  goToStep3(): void {
    this.step2Submitted.set(true);
    if (!this.selectedSlot()) {
      return;
    }
    this.currentStep.set(3);
    this.scrollToTop();
  }

  // Step 3 actions
  goToStep4(): void {
    this.step3Submitted.set(true);
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    // Guard: Prevent proceeding if client has 2+ no-shows (anti-no-show shield)
    const phone = this.clientForm.controls.phone.value;
    const check = this.catalogService.isClientBlocked(phone);
    if (check.blocked) {
      this.isClientPhoneBlocked.set(true);
      this.blockedClientReason.set(check.reason ?? null);
      return;
    }

    this.bookingError.set(null);
    this.currentStep.set(4);
    this.scrollToTop();
  }

  goBack(): void {
    this.bookingError.set(null);
    const step = this.currentStep();
    if (step > 1) {
      const targetStep = (step - 1) as 1 | 2 | 3 | 4;
      this.currentStep.set(targetStep);
      if (targetStep === 2) {
        this.loadRealSlotsForSelectedDate();
      }
      this.scrollToTop();
    }
  }

  /**
   * 1-Click recovery handler when a 409 Conflict occurs (slot was booked by another client):
   * clears the error banner, refreshes real slots from the backend, and returns to Step 2.
   */
  returnToSlotSelection(): void {
    this.bookingError.set(null);
    this.selectedSlot.set(null);
    this.currentStep.set(2);
    this.loadRealSlotsForSelectedDate();
    this.scrollToTop();
  }

  /**
   * 1-Click recovery handler when a 400 Bad Request / validation error occurs on client details:
   * clears the error banner and returns the user to Step 3 to adjust their form inputs.
   */
  returnToPersonalDetails(): void {
    this.bookingError.set(null);
    this.currentStep.set(3);
    this.scrollToTop();
  }

  /**
   * Step 4 final confirmation: submits the booking payload to POST /api/appointments.
   * Handles both successful confirmation and HTTP errors (e.g. 409 Conflict race condition,
   * 400 Bad Request validation failure, 429 Too Many Requests, 500 Server Error).
   */
  confirmBooking(): void {
    if (this.isSubmittingBooking()) {
      return;
    }

    this.bookingError.set(null);
    const currentBarber = this.barber();
    const service = this.selectedService();
    const slot = this.selectedSlot();
    const dateIso = this.selectedDateIso();

    if (!currentBarber || !service || !slot || !dateIso) {
      return;
    }

    // Guard: Enforce 14-day rolling booking horizon limit (2 weeks)
    const minIso = this.todayIso();
    const maxIso = this.maxBookingDateIso();
    if (dateIso < minIso || dateIso > maxIso) {
      const err = this.errorHandler.handleBookingError(
        'Data selectată depășește orizontul maxim de 14 zile sau este în trecut.'
      );
      this.bookingError.set(err);
      return;
    }

    const formVal = this.clientForm.getRawValue();

    // Guard: Enforce anti-no-show shield (2+ no-shows client must call salon)
    const blockCheck = this.catalogService.isClientBlocked(formVal.phone);
    if (blockCheck.blocked) {
      this.isClientPhoneBlocked.set(true);
      this.blockedClientReason.set(blockCheck.reason ?? null);
      this.currentStep.set(3);
      this.scrollToTop();
      return;
    }

    this.isSubmittingBooking.set(true);

    // Retrieve active referral attribution captured on landing (WhatsApp, Instagram, Friend referral, etc.)
    // If no promo/share tag was used, defaults to DIRECT_ORGANIC for accurate channel tracking.
    const activeRef = this.referralTracking.getActiveReferral();

    this.catalogService
      .createAppointmentApi({
        barberSlug: currentBarber.slug,
        barberName: currentBarber.name,
        barberPhotoUrl: currentBarber.photoUrl,
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        slotMinutes: service.slotMinutes,
        priceRon: service.priceRon,
        dateIso,
        dateLabel: this.selectedDayLabel(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        clientFirstName: formVal.firstName.trim(),
        clientLastName: formVal.lastName.trim(),
        clientEmail: formVal.email.trim(),
        clientPhone: (() => {
          const rawDigits = this.normalizeRawPhone(formVal.phone);
          return rawDigits.length === 9 ? `0${rawDigits}` : (rawDigits.startsWith('0') ? rawDigits : `0${rawDigits}`);
        })(),
        notes: formVal.notes.trim() || undefined,
        referralSource: activeRef.source,
        referralCode: activeRef.code,
        referralLabel: activeRef.label,
      })
      .subscribe({
        next: (createdRecord) => {
          this.isSubmittingBooking.set(false);
          this.confirmedAppointment.set(createdRecord);

          // Save returning client details in localStorage for invisible retention, prefill, and "Ultima vizită" badge
          this.clientStorage.saveClientProfile({
            lastName: formVal.lastName,
            firstName: formVal.firstName,
            phone: (() => {
            const rawDigits = this.normalizeRawPhone(formVal.phone);
            return rawDigits.length === 9 ? `0${rawDigits}` : (rawDigits.startsWith('0') ? rawDigits : `0${rawDigits}`);
          })(),
            email: formVal.email,
            barberId: currentBarber.id,
            barberSlug: currentBarber.slug,
          });

          this.isConfirmed.set(true);
          this.scrollToTop();
        },
        error: (err: unknown) => {
          this.isSubmittingBooking.set(false);
          const appErr = this.errorHandler.handleBookingError(err);
          this.bookingError.set(appErr);

          // If the slot was taken in the meantime (HTTP 409 Conflict), refresh real slots immediately
          if (appErr.status === 409) {
            this.selectedSlot.set(null);
            this.loadRealSlotsForSelectedDate();
          }

          this.scrollToTop();
        },
      });
  }

  // Share / copy barber link
  shareBarberLink(): void {
    const currentBarber = this.barber();
    if (!currentBarber || typeof window === 'undefined') {
      return;
    }
    const url = `${window.location.origin}/${currentBarber.slug}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 3000);
    }
  }

  // Helper to check if a form control has an error to display
  hasError(controlName: 'lastName' | 'firstName' | 'email' | 'phone' | 'gdprConsent'): boolean {
    const control = this.clientForm.controls[controlName];
    return control.invalid && (control.touched || this.step3Submitted());
  }

  // Portfolio lightbox methods
  openGallery(index = 0): void {
    const currentBarber = this.barber();
    if (currentBarber && currentBarber.portfolio.length > 0) {
      this.activePhotoIndex.set(index);
    }
  }

  closeGallery(): void {
    this.activePhotoIndex.set(null);
  }

  stepPhoto(delta: number): void {
    const current = this.activePhotoIndex();
    const total = this.barber()?.portfolio.length ?? 0;
    if (current === null || total === 0) {
      return;
    }
    this.activePhotoIndex.set((current + delta + total) % total);
  }

  onArrowKey(delta: number): void {
    if (this.activePhotoIndex() !== null) {
      this.stepPhoto(delta);
    }
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Generates upcoming working days based on the selected barber's active schedule and vacation/day-off blocks
  private generateWorkingDays(count = 8, barberSlug?: string): CalendarDayOption[] {
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

    const result: CalendarDayOption[] = [];
    const cursor = new Date();
    const cleanSlug = (barberSlug || this.activeSlug() || this.barber()?.slug || '').toLowerCase();

    // 14-day maximum horizon date limit for client reservations (2 weeks)
    const maxHorizonDate = new Date();
    maxHorizonDate.setDate(maxHorizonDate.getDate() + 14);
    maxHorizonDate.setHours(23, 59, 59, 999);

    let safety = 0;

    while (
      result.length < count &&
      cursor.getTime() <= maxHorizonDate.getTime() &&
      safety < 90
    ) {
      const dayOfWeek = cursor.getDay();
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;

      if (this.catalogService.isDateAvailableForBarber(cleanSlug, iso)) {
        result.push({
          iso,
          dayName: dayNamesShort[dayOfWeek],
          dayNumber: `${cursor.getDate()} ${monthsShort[cursor.getMonth()]}`,
          fullLabel: `${dayNamesFull[dayOfWeek]}, ${cursor.getDate()} ${monthsFull[cursor.getMonth()]}`,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
      safety++;
    }

    return result;
  }
}
