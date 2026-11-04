import { Routes } from '@angular/router';

export const routes: Routes = [
  // 1. Pagina principală (Home)
  {
    path: '',
    loadComponent: () => import('./features/public/public').then((m) => m.Public),
    pathMatch: 'full',
  },

  // 2. Pagini Publice
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

  // 3. Autentificare
  {
    path: 'login',
    loadComponent: () => import('./features/auth/auth').then((m) => m.Auth),
  },

  // 4. Zone protejate (Dashboard Client & Admin)
  {
    path: 'dashboard',
    loadComponent: () => import('./features/portal/portal').then((m) => m.Portal),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/portal/admin/admin').then((m) => m.Admin),
  },

  // 5. Pagina 404 Wildcard (trebuie să rămână ultima)
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
