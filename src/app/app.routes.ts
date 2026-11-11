import { Routes } from '@angular/router';

export const routes: Routes = [
  // Home page
  {
    path: '',
    loadComponent: () => import('./features/public/public').then((m) => m.Public),
    pathMatch: 'full',
  },

  // Public pages
  {
    path: 'despre',
    loadComponent: () =>
      import('./features/public/about/about').then((m) => m.About),
  },
  {
    path: 'echipa',
    loadComponent: () =>
      import('./features/public/services/services').then((m) => m.Services),
  },
  {
    path: 'servicii',
    redirectTo: 'echipa',
    pathMatch: 'full',
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/public/contact/contact').then((m) => m.Contact),
  },

  // Auth
  {
    path: 'login',
    loadComponent: () => import('./features/auth/auth').then((m) => m.Auth),
  },

  // Protected routes (Barber & Admin)
  {
    path: 'dashboard',
    loadComponent: () => import('./features/portal/portal').then((m) => m.Portal),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/portal/admin/admin').then((m) => m.Admin),
  },

  // Direct barber booking route (/filip, /sebi)
  {
    path: ':slug',
    loadComponent: () =>
      import('./features/booking/booking').then((m) => m.Booking),
  },

  // 404 wildcard (keep last)
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
