import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, throwError, timeout } from 'rxjs';
import { Barber } from '../../shared/models/barber.model';

// Barber data service connected to the Spring Boot REST API (/api/barbers).
@Injectable({ providedIn: 'root' })
export class BarberService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = BarberService.resolveApiUrl();
  private readonly portfolioStorageKey = 'gangstyle_barber_portfolios_v1';

  // Reactive map of custom/edited barber portfolios (slug -> array of image URLs / compressed data URLs)
  readonly customPortfolios = signal<Record<string, string[]>>(this.loadCustomPortfolios());

  private readonly fallbackBarbers: Barber[] = [
    {
      id: 'b-filip',
      name: 'Filip',
      slug: 'filip',
      phone: '0770 426 308',
      bio: 'Fondator Gang Style cu peste 5 ani experiență în frizerie modernă.',
      photoUrl: '/images/Filip.jpg',
      specialties: ['Skin Fade', 'Contur Barbă cu Briciul', 'Styling Texturat'],
      portfolio: [
        '/images/salon.jpg',
        '/images/salon2.jpg',
        '/images/salon3.jpg',
        '/images/about.jpg',
      ],
    },
    {
      id: 'b-sebi',
      name: 'Sebi',
      slug: 'sebi',
      phone: '0722 918 440',
      bio: 'Specialist în tunsori clasice și îngrijirea bărbii cu prosop cald.',
      photoUrl: '/images/Sebi.jpg',
      specialties: ['Tuns Clasic', 'Tratament Barbă cu Prosop Cald', 'Modern Crop'],
      portfolio: [
        '/images/salon2.jpg',
        '/images/salon3.jpg',
        '/images/salon.jpg',
        '/images/about.jpg',
      ],
    },
  ];

  private static resolveApiUrl(): string {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:8080/api/barbers`;
  }

  private loadCustomPortfolios(): Record<string, string[]> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }
    try {
      const raw = window.localStorage.getItem(this.portfolioStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveCustomPortfolios(mapData: Record<string, string[]>): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.portfolioStorageKey, JSON.stringify(mapData));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  // Updates a barber's portfolio reactively, saves to localStorage, and syncs to Spring Boot backend
  updatePortfolio(slug: string, portfolio: string[]): void {
    const cleanSlug = (slug || '').trim().toLowerCase();
    if (!cleanSlug) return;
    const cleanList = (portfolio || []);
    const updatedMap = {
      ...this.customPortfolios(),
      [cleanSlug]: cleanList,
    };
    this.customPortfolios.set(updatedMap);
    this.saveCustomPortfolios(updatedMap);

    // Sync asynchronously with backend MongoDB
    this.http
      .put<Barber>(`${this.apiUrl}/${cleanSlug}/portfolio`, cleanList)
      .pipe(
        timeout(3500),
        catchError(() => of(null))
      )
      .subscribe();
  }

  // Compresses an uploaded image file from phone gallery/camera into an optimized web DataURL
  compressImageFile(file: File, maxDimension = 1080, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nu s-a putut citi fișierul imagine.'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (typeof document === 'undefined') {
          resolve(dataUrl);
          return;
        }
        const img = new Image();
        img.onerror = () => resolve(dataUrl);
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  private normalizeBarber(barber: Barber): Barber {
    const normalizeUrl = (url: string | undefined): string => {
      if (!url) return '/images/gangstyle.jpg';
      if (
        url.startsWith('data:') ||
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('/')
      ) {
        return url;
      }
      return '/' + url;
    };

    const slugKey = (barber.slug || '').trim().toLowerCase();
    const customList = this.customPortfolios()[slugKey];
    const rawPortfolio = customList !== undefined ? customList : barber.portfolio || [];

    return {
      ...barber,
      photoUrl: normalizeUrl(barber.photoUrl),
      portfolio: rawPortfolio.map((p) => normalizeUrl(p)),
    };
  }

  getInitialBarbers(): Barber[] {
    return this.fallbackBarbers.map((b) => this.normalizeBarber(b));
  }

  getAll(): Observable<Barber[]> {
    return this.http.get<Barber[]>(this.apiUrl).pipe(
      timeout(1200),
      map((barbers) => barbers.map((b) => this.normalizeBarber(b))),
      catchError(() => of(this.getInitialBarbers()))
    );
  }

  getBySlug(slug: string): Observable<Barber> {
    return this.http.get<Barber>(`${this.apiUrl}/${slug.toLowerCase()}`).pipe(
      timeout(1200),
      map((barber) => this.normalizeBarber(barber)),
      catchError(() => {
        const found = this.fallbackBarbers.find(
          (b) => b.slug.toLowerCase() === slug.toLowerCase()
        );
        return found
          ? of(this.normalizeBarber(found))
          : throwError(() => new Error('Frizer negăsit'));
      })
    );
  }
}
