import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Barber } from '../../shared/models/barber.model';

// Barber data service connected to the Spring Boot REST API (/api/barbers).
@Injectable({ providedIn: 'root' })
export class BarberService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = BarberService.resolveApiUrl();

  private static resolveApiUrl(): string {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:8080/api/barbers`;
  }

  getAll(): Observable<Barber[]> {
    return this.http.get<Barber[]>(this.apiUrl);
  }

  getBySlug(slug: string): Observable<Barber> {
    return this.http.get<Barber>(`${this.apiUrl}/${slug.toLowerCase()}`);
  }
}
