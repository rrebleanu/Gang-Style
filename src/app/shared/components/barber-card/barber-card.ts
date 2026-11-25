import { Component, computed, ElementRef, inject, input, signal, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { BarberService } from '../../../core/services/barber.service';
import { Barber } from '../../models/barber.model';

// Barber card with hover animation, portfolio lightbox, and self-service gallery manager for logged-in barbers.
@Component({
  selector: 'app-barber-card',
  imports: [RouterLink],
  templateUrl: './barber-card.html',
  styleUrl: './barber-card.scss',
  host: {
    '(document:keydown.escape)': 'onEscapeKey()',
    '(document:keydown.arrowleft)': 'onArrowKey(-1)',
    '(document:keydown.arrowright)': 'onArrowKey(1)',
    '(window:popstate)': 'onPopState()',
  },
})
export class BarberCard {
  private readonly authService = inject(AuthService);
  private readonly barberService = inject(BarberService);

  readonly barber = input.required<Barber>();
  readonly isLastVisit = input(false);
  readonly showBooking = input(true);

  readonly barberPhone = computed<string>(() => this.barber().phone || '0770 426 308');

  // True when the logged-in user is a staff member (barber or admin)
  readonly isStaffUser = computed<boolean>(() => {
    const user = this.authService.currentUser();
    return this.authService.isBarber(user) || this.authService.isAdmin(user);
  });

  // Reactive portfolio list (reflects live uploads, replacements, reordering & deletions)
  readonly portfolioPhotos = computed<string[]>(() => {
    const slug = (this.barber().slug || '').trim().toLowerCase();
    const custom = this.barberService.customPortfolios()[slug];
    if (custom !== undefined) {
      return custom;
    }
    return this.barber().portfolio || [];
  });

  // True when the logged-in user is this card's barber (or an admin)
  readonly canEditGallery = computed<boolean>(() => {
    const user = this.authService.currentUser();
    if (!user || !this.authService.isLoggedIn()) {
      return false;
    }
    if (this.authService.isAdmin(user)) {
      return true;
    }
    if (this.authService.isBarber(user)) {
      const userSlug = this.authService.getCurrentBarberSlug(user);
      const cardSlug = (this.barber().slug || '').trim().toLowerCase();
      return (
        !!userSlug &&
        !!cardSlug &&
        (userSlug === cardSlug || userSlug.startsWith(cardSlug) || cardSlug.startsWith(userSlug))
      );
    }
    return false;
  });

  // null = modal closed; number = active photo index (0 even if empty when in edit mode)
  readonly activePhotoIndex = signal<number | null>(null);
  readonly isEditingGallery = signal<boolean>(false);
  readonly isUploading = signal<boolean>(false);
  readonly galleryFeedback = signal<string | null>(null);
  readonly isActionSheetOpen = signal<boolean>(false);
  private nextCardSlot = signal<number>(0);
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('thumbsTrack') thumbsTrack?: ElementRef<HTMLDivElement>;

  openGallery(index = 0, event?: Event): void {
    event?.stopPropagation();
    const wasClosed = this.activePhotoIndex() === null;
    const total = this.portfolioPhotos().length;
    if (total > 0) {
      this.activePhotoIndex.set(Math.min(Math.max(0, index), total - 1));
      this.isEditingGallery.set(this.canEditGallery());
    } else if (this.canEditGallery()) {
      this.activePhotoIndex.set(0);
      this.isEditingGallery.set(true);
    }
    if (wasClosed) {
      this.nextCardSlot.set(0);
    }
    if (wasClosed && this.activePhotoIndex() !== null && typeof window !== 'undefined') {
      window.history.pushState({ gangGallery: this.barber().slug }, '');
    }
    this.scrollActiveThumbIntoView();
  }

  toggleEditGallery(event?: Event): void {
    event?.stopPropagation();
    this.isEditingGallery.update((v) => !v);
  }

  closeGallery(): void {
    this.closeActionSheet();
    this.activePhotoIndex.set(null);
    this.galleryFeedback.set(null);
    this.isEditingGallery.set(false);
  }

  onEscapeKey(): void {
    this.closeGallery();
  }

  // Intercepts phone / browser Back button so user exits the gallery without leaving the site
  onPopState(): void {
    if (this.activePhotoIndex() !== null) {
      this.activePhotoIndex.set(null);
      this.galleryFeedback.set(null);
      this.isEditingGallery.set(false);
    }
  }

  stepPhoto(delta: number): void {
    const current = this.activePhotoIndex();
    const total = this.portfolioPhotos().length;
    if (current === null || total === 0) {
      return;
    }
    this.activePhotoIndex.set((current + delta + total) % total);
    this.scrollActiveThumbIntoView();
  }

  onThumbClick(index: number): void {
    this.activePhotoIndex.set(index);
    this.scrollActiveThumbIntoView();
  }

  scrollThumbsTrack(direction: number): void {
    const track = this.thumbsTrack?.nativeElement;
    if (!track) return;
    track.scrollBy({ left: direction * 240, behavior: 'smooth' });
  }

  scrollActiveThumbIntoView(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const track = this.thumbsTrack?.nativeElement;
      if (!track) return;
      const activeThumb = track.querySelector<HTMLElement>('.lightbox__thumb--active');
      activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 60);
  }

  onArrowKey(delta: number): void {
    if (this.activePhotoIndex() !== null) {
      this.stepPhoto(delta);
    }
  }

  openActionSheet(event?: Event): void {
    event?.stopPropagation();
    this.isActionSheetOpen.set(true);
  }

  closeActionSheet(): void {
    this.isActionSheetOpen.set(false);
  }

  // Sets a non-card photo (index >= 3) into the card showcase slots sequentially:
  // 1st click -> Slot #1 (Copertă)
  // 2nd click (on another photo) -> Slot #2
  // 3rd click (on another photo) -> Slot #3
  // then cycles back to Slot #1
  setAsMainImage(): void {
    const currentIndex = this.activePhotoIndex();
    const list = [...this.portfolioPhotos()];
    if (currentIndex === null || currentIndex < 3 || currentIndex >= list.length) {
      return;
    }

    let targetSlot = this.nextCardSlot();
    if (targetSlot < 0 || targetSlot > 2) {
      targetSlot = 0;
    }

    // Move current photo into targetSlot (0 = #1, 1 = #2, 2 = #3)
    const [selected] = list.splice(currentIndex, 1);
    const safeSlot = Math.min(targetSlot, list.length);
    list.splice(safeSlot, 0, selected);

    this.barberService.updatePortfolio(this.barber().slug, list);
    this.activePhotoIndex.set(safeSlot);
    this.nextCardSlot.set((safeSlot + 1) % 3);
    this.scrollActiveThumbIntoView();

    const slotNames = ['Imaginea #1 pe card (Copertă)', 'Imaginea #2 pe card', 'Imaginea #3 pe card'];
    this.showGalleryFeedback(`✓ Setată ca ${slotNames[safeSlot]}!`);
  }

  // Sets the current photo into an explicit slot
  setPhotoCardSlot(targetSlot: number): void {
    const currentIndex = this.activePhotoIndex();
    const list = [...this.portfolioPhotos()];
    if (currentIndex === null || currentIndex < 0 || currentIndex >= list.length) {
      return;
    }
    if (targetSlot < 0 || targetSlot > 2) {
      return;
    }
    if (currentIndex === targetSlot) {
      return;
    }

    const [selected] = list.splice(currentIndex, 1);
    const safeSlot = Math.min(targetSlot, list.length);
    list.splice(safeSlot, 0, selected);

    this.barberService.updatePortfolio(this.barber().slug, list);
    this.activePhotoIndex.set(safeSlot);
    this.nextCardSlot.set((safeSlot + 1) % 3);
    this.scrollActiveThumbIntoView();

    const slotLabels = ['Poza #1 (Principală)', 'Poza #2', 'Poza #3'];
    this.showGalleryFeedback(`✓ Poza a fost setată ca ${slotLabels[safeSlot]} pe card!`);
  }

  // Rotates the active photo 90 degrees clockwise
  async rotateActivePhoto(): Promise<void> {
    const currentIndex = this.activePhotoIndex();
    const list = [...this.portfolioPhotos()];
    if (currentIndex === null || currentIndex < 0 || currentIndex >= list.length) {
      return;
    }

    this.isUploading.set(true);
    try {
      const rotated = await this.rotateImage90(list[currentIndex]);
      list[currentIndex] = rotated;
      this.barberService.updatePortfolio(this.barber().slug, list);
      this.showGalleryFeedback('✓ Poza a fost rotită!');
    } catch {
      this.showGalleryFeedback('Eroare la rotirea pozei.');
    } finally {
      this.isUploading.set(false);
    }
  }

  private rotateImage90(src: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  // Handles adding 1 or multiple new photos from phone gallery/camera
  async onAddPhotosSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const files = inputEl.files;
    if (!files || files.length === 0) return;

    const currentList = [...this.portfolioPhotos()];
    this.isUploading.set(true);
    try {
      const compressedUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await this.barberService.compressImageFile(file);
        compressedUrls.push(dataUrl);
      }

      if (compressedUrls.length > 0) {
        const updated = [...currentList, ...compressedUrls];
        this.barberService.updatePortfolio(this.barber().slug, updated);
        const firstNewIndex = currentList.length;
        this.activePhotoIndex.set(firstNewIndex);
        this.showGalleryFeedback(
          compressedUrls.length === 1
            ? `✓ Poza a fost adăugată cu succes!`
            : `✓ ${compressedUrls.length} poze au fost adăugate în galerie!`
        );
      }
    } catch {
      this.showGalleryFeedback('Eroare la încărcarea imaginii. Încearcă o altă poză.');
    } finally {
      this.isUploading.set(false);
      inputEl.value = '';
    }
  }

  // Handles replacing the currently active photo with a new one from phone
  async onReplacePhotoSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    const currentIndex = this.activePhotoIndex();
    if (!file || currentIndex === null) return;

    this.isUploading.set(true);
    try {
      const dataUrl = await this.barberService.compressImageFile(file);
      const updated = [...this.portfolioPhotos()];
      if (currentIndex >= 0 && currentIndex < updated.length) {
        updated[currentIndex] = dataUrl;
      } else {
        updated.push(dataUrl);
      }
      this.barberService.updatePortfolio(this.barber().slug, updated);
      this.showGalleryFeedback('✓ Poza a fost înlocuită!');
    } catch {
      this.showGalleryFeedback('Eroare la înlocuirea imaginii.');
    } finally {
      this.isUploading.set(false);
      inputEl.value = '';
    }
  }

  // Deletes the currently active photo from the gallery
  deleteActivePhoto(): void {
    const currentIndex = this.activePhotoIndex();
    const list = [...this.portfolioPhotos()];
    if (currentIndex === null || currentIndex < 0 || currentIndex >= list.length) {
      return;
    }

    list.splice(currentIndex, 1);
    this.barberService.updatePortfolio(this.barber().slug, list);

    if (list.length === 0) {
      this.activePhotoIndex.set(0);
    } else if (currentIndex >= list.length) {
      this.activePhotoIndex.set(list.length - 1);
    }
    this.showGalleryFeedback('✓ Poza a fost ștearsă din galerie.');
  }

  private showGalleryFeedback(msg: string): void {
    this.galleryFeedback.set(msg);
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    this.feedbackTimer = setTimeout(() => {
      this.galleryFeedback.set(null);
    }, 3500);
  }

  // Mobile touch gesture tracking for swipe navigation
  private touchStartX = 0;
  private touchStartY = 0;

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length > 0) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length > 0) {
      const deltaX = event.changedTouches[0].clientX - this.touchStartX;
      const deltaY = event.changedTouches[0].clientY - this.touchStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
        if (deltaX < 0) {
          this.stepPhoto(1);
        } else {
          this.stepPhoto(-1);
        }
      }
    }
  }

  onPhotoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.src.includes('gangstyle.jpg')) {
      img.src = '/images/gangstyle.jpg';
    }
  }

  onThumbError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.src.includes('salon.jpg')) {
      img.src = '/images/salon.jpg';
    }
  }
}
