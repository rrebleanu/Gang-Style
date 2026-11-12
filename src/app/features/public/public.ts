import { Component, inject, OnInit, signal } from '@angular/core';
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

  readonly barbers = signal<Barber[]>([]);
  readonly isLoadingBarbers = signal(true);
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
    this.isLoadingBarbers.set(true);
    this.barbersError.set(null);

    this.barberService.getAll().subscribe({
      next: (data) => {
        this.barbers.set(data);
        this.isLoadingBarbers.set(false);
      },
      error: () => {
        this.barbersError.set(
          'Nu am putut încărca lista de frizeri. Verifică dacă serverul backend este pornit.'
        );
        this.isLoadingBarbers.set(false);
      },
    });
  }
}
