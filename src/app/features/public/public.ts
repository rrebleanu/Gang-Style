import { Component, inject, OnInit, signal } from '@angular/core';
import { BarberService } from '../../core/services/barber.service';
import { BarberCard } from '../../shared/components/barber-card/barber-card';

@Component({
  selector: 'app-public',
  imports: [BarberCard],
  templateUrl: './public.html',
  styleUrl: './public.scss',
})
export class Public implements OnInit {
  private readonly barberService = inject(BarberService);

  readonly barbers = this.barberService.getAll();

  // Barber id from the client's last visit (read from localStorage)
  readonly lastVisitBarberId = signal<string | null>(null);

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedId = window.localStorage.getItem('gangstyle_last_barber_id');
      if (savedId) {
        this.lastVisitBarberId.set(savedId);
      }
    }
  }
}
