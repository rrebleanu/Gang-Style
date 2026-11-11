import { Injectable } from '@angular/core';
import { Barber } from '../../shared/models/barber.model';

// Barber data service (static for now, replaced by GET /api/barbers later).
@Injectable({ providedIn: 'root' })
export class BarberService {
  private readonly barbers: Barber[] = [
    {
      id: 'b1',
      slug: 'filip',
      name: 'Filip',
      bio: 'Linii curate și tunsori moderne, adaptate stilului tău.',
      photoUrl: 'images/Filip.jpg',
      specialties: ['Skin fade', 'Tunsori moderne', 'Contur barbă'],
      portfolio: [
        'images/salon.jpg',
        'images/salon2.jpg',
        'images/salon3.jpg',
        'images/about.jpg',
        'images/salon2.jpg',
      ],
    },
    {
      id: 'b2',
      slug: 'sebi',
      name: 'Sebi',
      bio: 'Tehnică clasică, atenție la detalii și bărbierit tradițional.',
      photoUrl: 'images/Sebi.jpg',
      specialties: ['Tunsori clasice', 'Bărbierit cu brici', 'Styling'],
      portfolio: [
        'images/salon2.jpg',
        'images/salon3.jpg',
        'images/salon.jpg',
        'images/about.jpg',
        'images/salon3.jpg',
      ],
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
