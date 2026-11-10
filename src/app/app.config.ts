import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled', // links like "/#frizeri" scroll to the section
        scrollPositionRestoration: 'enabled', // new page starts at the top
      }),
      withRouterConfig({
        onSameUrlNavigation: 'reload', // allows re-scrolling if user clicks the same anchor link again
      }),
    ),
    provideClientHydration(withEventReplay()),
  ],
};
