import { Injectable } from '@angular/core';
import { Barber } from '../../shared/models/barber.model';

// Single source of barber data for the whole frontend.
// For now the data is static; on Day 11 it will come from the Spring Boot API (GET /api/barbers).
// Photos are temporary placeholders until the real salon photos are added.
@Injectable({ providedIn: 'root' })
export class BarberService {
  private readonly barbers: Barber[] = [
    {
      id: 'b1',
      slug: 'filip',
      name: 'Filip',
      bio: 'Linii curate și tunsori moderne, adaptate stilului tău.',
      photoUrl: 'images/salon3.jpg',
      specialties: ['Skin fade', 'Tunsori moderne', 'Contur barbă'],
      portfolio: ['images/salon.jpg', 'images/salon2.jpg', 'images/salon3.jpg'],
    },
    {
      id: 'b2',
      slug: 'sebi',
      name: 'Sebi',
      bio: 'Tehnică clasică, atenție la detalii și bărbierit tradițional.',
      photoUrl: 'images/salon2.jpg',
      specialties: ['Tunsori clasice', 'Bărbierit cu brici', 'Styling'],
      portfolio: ['images/salon2.jpg', 'images/salon3.jpg', 'images/salon.jpg'],
    },
  ];

  getAll(): Barber[] {
    return this.barbers;
  }

  // used on Day 5 by the /:slug route
  getBySlug(slug: string): Barber | undefined {
    return this.barbers.find((barber) => barber.slug === slug.toLowerCase());
  }
}
