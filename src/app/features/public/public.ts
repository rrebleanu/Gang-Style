import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { BarberService } from '../../core/services/barber.service';
import { BarberCard } from '../../shared/components/barber-card/barber-card';
import { Barber } from '../../shared/models/barber.model';

@Component({
  selector: 'app-public',
  imports: [BarberCard],
  templateUrl: './public.html',
  styleUrl: './public.scss',
})
export class Public implements OnInit {
  private readonly barberService = inject(BarberService);
  readonly authService = inject(AuthService);

  readonly isBarber = computed(() => {
    return this.authService.isBarber();
  });

  readonly isAdmin = computed(() => {
    return this.authService.isAdmin();
  });

  readonly isStaff = computed(() => {
    return this.authService.isBarber() || this.authService.isAdmin();
  });

  readonly barbers = signal<Barber[]>(this.barberService.getInitialBarbers());
  readonly isLoadingBarbers = signal(false);
  readonly barbersError = signal<string | null>(null);

  // Barber id from the client's last visit (read from localStorage)
  readonly lastVisitBarberId = signal<string | null>(null);

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedId = window.localStorage.getItem('gangstyle_last_barber_id');
      if (savedId) {
        this.lastVisitBarberId.set(savedId);
      }
    }

    this.loadBarbers();
  }

  loadBarbers(): void {
    if (this.barbers().length === 0) {
      this.isLoadingBarbers.set(true);
    }
    this.barbersError.set(null);

    this.barberService.getAll().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.barbers.set(data);
        }
        this.isLoadingBarbers.set(false);
      },
      error: () => {
        // If we already have barbers from initial fallback, do not block UI with an error box
        if (this.barbers().length === 0) {
          this.barbersError.set(
            'Nu am putut încărca lista de frizeri. Verifică dacă serverul backend este pornit.'
          );
        }
        this.isLoadingBarbers.set(false);
      },
    });
  }
}
