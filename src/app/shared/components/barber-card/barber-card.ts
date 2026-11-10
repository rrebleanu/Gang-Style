import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Barber } from '../../models/barber.model';

// Reusable card for one barber. The parent decides which barber to show.
@Component({
  selector: 'app-barber-card',
  imports: [RouterLink],
  templateUrl: './barber-card.html',
  styleUrl: './barber-card.scss',
})
export class BarberCard {
  // required: the card cannot be rendered without a barber
  readonly barber = input.required<Barber>();

  // optional: shows the "⭐ Ultima vizită" badge (filled from localStorage on Day 21)
  readonly isLastVisit = input(false);
}
