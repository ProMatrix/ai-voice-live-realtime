import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { LIVE_ASSISTANT_SERVICE_TOKEN } from 'llm-common';
import { GoogleLiveAssistantService } from 'llm-google';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    { provide: LIVE_ASSISTANT_SERVICE_TOKEN, useClass: GoogleLiveAssistantService },
  ],
};
