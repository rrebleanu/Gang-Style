import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError, timeout } from 'rxjs';
import { Barber } from '../../shared/models/barber.model';

// Barber data service connected to the Spring Boot REST API (/api/barbers).
@Injectable({ providedIn: 'root' })
export class BarberService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = BarberService.resolveApiUrl();

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
      phone: '0770 426 308',
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

  private normalizeBarber(barber: Barber): Barber {
    const normalizeUrl = (url: string | undefined): string => {
      if (!url) return '/images/gangstyle.jpg';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
        return url;
      }
      return '/' + url;
    };

    return {
      ...barber,
      photoUrl: normalizeUrl(barber.photoUrl),
      portfolio: (barber.portfolio || []).map((p) => normalizeUrl(p)),
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
