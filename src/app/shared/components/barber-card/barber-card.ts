import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Barber } from '../../models/barber.model';

// Reusable card for one barber with hover animation and portfolio lightbox modal.
@Component({
  selector: 'app-barber-card',
  imports: [RouterLink],
  templateUrl: './barber-card.html',
  styleUrl: './barber-card.scss',
  host: {
    '(document:keydown.escape)': 'closeGallery()',
    '(document:keydown.arrowleft)': 'onArrowKey(-1)',
    '(document:keydown.arrowright)': 'onArrowKey(1)',
  },
})
export class BarberCard {
  // required: the card cannot be rendered without a barber
  readonly barber = input.required<Barber>();

  // optional: shows the "⭐ Ultima vizită" badge (filled from localStorage on Day 21)
  readonly isLastVisit = input(false);

  // null = gallery modal closed; number = index of currently opened photo in portfolio
  readonly activePhotoIndex = signal<number | null>(null);

  openGallery(index = 0, event?: Event): void {
    event?.stopPropagation();
    if (this.barber().portfolio.length > 0) {
      this.activePhotoIndex.set(index);
    }
  }

  closeGallery(): void {
    this.activePhotoIndex.set(null);
  }

  stepPhoto(delta: number): void {
    const current = this.activePhotoIndex();
    const total = this.barber().portfolio.length;
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
}
