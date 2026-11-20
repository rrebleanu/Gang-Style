import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface ReturningClientProfile {
  lastName: string;
  firstName: string;
  phone: string;
  email?: string;
  lastBarberId?: string;
  lastBarberSlug?: string;
  lastVisitDate?: string;
}

/**
 * Service managing returning client preferences and invisible retention via localStorage.
 * Handles SSR safety (isPlatformBrowser) and data sanitization for sensitive personal info.
 */
@Injectable({
  providedIn: 'root',
})
export class ClientStorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly STORAGE_KEY = 'gangstyle_client_profile';
  private readonly LEGACY_BARBER_KEY = 'gangstyle_last_barber_id';

  /**
   * Safely reads returning client data in the browser (returns null during SSR).
   */
  getClientProfile(): ReturningClientProfile | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ReturningClientProfile;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // Ignore JSON parse errors or restricted localStorage mode
    }
    return null;
  }

  /**
   * Saves returning client contact info and preferred barber upon booking confirmation.
   * Strips extra whitespace and records ISO timestamp.
   */
  saveClientProfile(data: {
    lastName: string;
    firstName: string;
    phone: string;
    email?: string;
    barberId?: string;
    barberSlug?: string;
  }): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      const profile: ReturningClientProfile = {
        lastName: (data.lastName || '').trim(),
        firstName: (data.firstName || '').trim(),
        phone: (data.phone || '').trim(),
        email: data.email?.trim() || undefined,
        lastBarberId: data.barberId,
        lastBarberSlug: data.barberSlug,
        lastVisitDate: new Date().toISOString(),
      };

      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));

      // Maintain legacy key for seamless compatibility with existing storage entries
      if (data.barberId) {
        window.localStorage.setItem(this.LEGACY_BARBER_KEY, data.barberId);
      }
    } catch {
      // Ignore quota exceeded or storage disabled
    }
  }

  /**
   * Returns the ID or slug of the last barber visited by the client.
   */
  getLastBarberId(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const profile = this.getClientProfile();
      if (profile?.lastBarberId) {
        return profile.lastBarberId;
      }
      if (profile?.lastBarberSlug) {
        return profile.lastBarberSlug;
      }
      return window.localStorage.getItem(this.LEGACY_BARBER_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Clears saved client profile.
   */
  clearProfile(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      window.localStorage.removeItem(this.STORAGE_KEY);
      window.localStorage.removeItem(this.LEGACY_BARBER_KEY);
    } catch {
      // Ignore
    }
  }
}
