import { Component, inject, signal } from '@angular/core';
import { BarberService } from '../../core/services/barber.service';
import { BarberCard } from '../../shared/components/barber-card/barber-card';

@Component({
  selector: 'app-public',
  imports: [BarberCard],
  templateUrl: './public.html',
  styleUrl: './public.scss',
})
export class Public {
  private readonly barberService = inject(BarberService);

  readonly barbers = this.barberService.getAll();

  // id of the barber from the client's last booking.
  // null for now; on Day 21 it will be read from localStorage.
  readonly lastVisitBarberId = signal<string | null>(null);
}
