import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BarberService } from '../../core/services/barber.service';
import { AuthService } from '../../core/services/auth.service';
import { ServiceCatalogService } from '../../core/services/service-catalog.service';
import { Barber } from '../../shared/models/barber.model';
import { ServiceItem, TimeSlot } from '../../shared/models/service-item.model';

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
  readonly authService = inject(AuthService);

  // Active barber and their service packages
  readonly barber = signal<Barber | null>(null);
  readonly services = signal<ServiceItem[]>([]);

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

  // Computed time slots for the selected barber, date, and service
  readonly timeSlots = computed<TimeSlot[]>(() => {
    const currentBarber = this.barber();
    const service = this.selectedService();
    const dateIso = this.selectedDateIso();
    if (!currentBarber || !service || !dateIso) {
      return [];
    }
    return this.catalogService.getSlotsForDate(currentBarber.slug, dateIso, service);
  });

  readonly selectedDayLabel = computed<string>(() => {
    const iso = this.selectedDateIso();
    const found = this.availableDays().find((d) => d.iso === iso);
    if (found) {
      return found.fullLabel;
    }
    return iso;
  });

  // Step 3 reactive form with validators
  readonly clientForm = this.fb.nonNullable.group({
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9\s]{9,12}$/)]],
    notes: [''],
    gdprConsent: [false, [Validators.requiredTrue]],
  });

  ngOnInit(): void {
    const loggedUser = this.authService.currentUser();
    if (loggedUser?.email.includes('@')) {
      this.clientForm.controls.email.setValue(loggedUser.email);
    }

    const days = this.generateWorkingDays(7);
    this.availableDays.set(days);
    if (days.length > 0) {
      this.selectedDateIso.set(days[0].iso);
    }

    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') ?? '';
      const foundBarber = this.barberService.getBySlug(slug);

      if (!foundBarber) {
        this.router.navigate(['/404']);
        return;
      }

      this.barber.set(foundBarber);
      const barberServices = this.catalogService.getByBarberSlug(foundBarber.slug);
      this.services.set(barberServices);

      // If navigated via 1-Click Reschedule (?serviceId=...), pre-select service and jump to Step 2
      const preselectedId = this.route.snapshot.queryParamMap.get('serviceId');
      if (preselectedId) {
        const matchedService = barberServices.find((s) => s.id === preselectedId);
        if (matchedService) {
          this.selectedService.set(matchedService);
          this.currentStep.set(2);
        }
      }
    });
  }

  // Step 1 actions
  selectService(item: ServiceItem): void {
    const previous = this.selectedService();
    this.selectedService.set(item);
    this.step1Submitted.set(false);

    // Reset selected time slot if duration changed
    if (!previous || previous.slotMinutes !== item.slotMinutes) {
      this.selectedSlot.set(null);
    }
  }

  goToStep2(): void {
    this.step1Submitted.set(true);
    if (!this.selectedService()) {
      return;
    }
    this.currentStep.set(2);
    this.scrollToTop();
  }

  // Step 2 actions
  selectDate(iso: string): void {
    this.selectedDateIso.set(iso);
    this.selectedSlot.set(null);
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
    this.currentStep.set(4);
    this.scrollToTop();
  }

  goBack(): void {
    const step = this.currentStep();
    if (step > 1) {
      this.currentStep.set((step - 1) as 1 | 2 | 3 | 4);
      this.scrollToTop();
    }
  }

  // Step 4 final confirmation
  confirmBooking(): void {
    const currentBarber = this.barber();
    const service = this.selectedService();
    const slot = this.selectedSlot();
    const dateIso = this.selectedDateIso();

    if (!currentBarber || !service || !slot || !dateIso) {
      return;
    }

    const formVal = this.clientForm.getRawValue();

    // Persist full appointment record and mark slot as occupied
    this.catalogService.createAppointment({
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
      clientPhone: formVal.phone.trim(),
      notes: formVal.notes.trim() || undefined,
    });

    // Save last visited barber in localStorage for the "⭐ Ultima vizită" badge on Home
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('gangstyle_last_barber_id', currentBarber.id);
    }

    this.isConfirmed.set(true);
    this.scrollToTop();
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

  // Generates upcoming salon working days (Tuesday - Saturday)
  private generateWorkingDays(count: number): CalendarDayOption[] {
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

    while (result.length < count) {
      const dayOfWeek = cursor.getDay(); // 0 = Sun, 1 = Mon
      if (dayOfWeek !== 0 && dayOfWeek !== 1) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        const iso = `${yyyy}-${mm}-${dd}`;

        result.push({
          iso,
          dayName: dayNamesShort[dayOfWeek],
          dayNumber: `${cursor.getDate()} ${monthsShort[cursor.getMonth()]}`,
          fullLabel: `${dayNamesFull[dayOfWeek]}, ${cursor.getDate()} ${monthsFull[cursor.getMonth()]}`,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }
}
