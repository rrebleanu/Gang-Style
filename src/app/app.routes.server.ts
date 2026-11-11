import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: ':slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return [{ slug: 'filip' }, { slug: 'sebi' }];
    },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
