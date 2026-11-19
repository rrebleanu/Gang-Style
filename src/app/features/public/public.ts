import {
  AfterViewInit,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
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
export class Public implements OnInit, AfterViewInit, OnDestroy {
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

  // Active barber card in the center of the mobile/tablet viewport during scroll
  readonly activeScrollBarberId = signal<string | null>(null);
  private scrollObserver?: IntersectionObserver;
  private readonly cardVisibilityMap = new Map<string, number>();

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedId = window.localStorage.getItem('gangstyle_last_barber_id');
      if (savedId) {
        this.lastVisitBarberId.set(savedId);
      }
    }

    this.loadBarbers();
  }

  ngAfterViewInit(): void {
    this.initScrollObserver();
  }

  ngOnDestroy(): void {
    this.scrollObserver?.disconnect();
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
          // Re-attach observer for newly rendered cards
          setTimeout(() => this.initScrollObserver(), 60);
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

  /**
   * Initializes IntersectionObserver for mobile/tablet screens (<= 1000px)
   * to automatically highlight the barber card centered in the reader's view.
   */
  private initScrollObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    this.scrollObserver?.disconnect();
    this.cardVisibilityMap.clear();

    // Central band: focuses on the vertical center 60% of the screen
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        // Only activate on single-column responsive viewports (<= 1000px)
        if (window.innerWidth > 1000) {
          if (this.activeScrollBarberId() !== null) {
            this.activeScrollBarberId.set(null);
          }
          return;
        }

        for (const entry of entries) {
          const barberId = (entry.target as HTMLElement).getAttribute('data-barber-id');
          if (barberId) {
            this.cardVisibilityMap.set(
              barberId,
              entry.isIntersecting ? entry.intersectionRatio : 0
            );
          }
        }

        // Find the barber with the highest visibility ratio in the center band
        let maxRatio = 0.25;
        let mostCenteredBarberId: string | null = null;

        for (const [id, ratio] of this.cardVisibilityMap.entries()) {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            mostCenteredBarberId = id;
          }
        }

        if (mostCenteredBarberId) {
          this.activeScrollBarberId.set(mostCenteredBarberId);
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -20% 0px',
        threshold: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0],
      }
    );

    const cardElements = document.querySelectorAll('.team__grid app-barber-card');
    cardElements.forEach((el) => this.scrollObserver?.observe(el));
  }
}
