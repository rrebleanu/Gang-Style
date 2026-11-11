import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Barber } from '../../models/barber.model';

// Barber card with hover animation and portfolio lightbox.
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
  readonly barber = input.required<Barber>();
  readonly isLastVisit = input(false);

  // null = modal closed; number = active photo index
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
