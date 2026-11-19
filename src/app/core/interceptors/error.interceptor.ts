import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ErrorHandlerService } from '../services/error-handler.service';
import { ErrorRoleContext } from '../errors/app-error.model';

/**
 * Global HTTP Error Interceptor for Gang Style.
 * 
 * Intercepts all failed HTTP requests:
 * 1. Automatically detects expired or invalidated JWT tokens (401 Unauthorized)
 *    and clears local credentials to prevent infinite redirect loops.
 * 2. Determines the appropriate role/domain context based on the request URI.
 * 3. Formats and logs the error through ErrorHandlerService so all subscribers
 *    receive consistent, friendly Romanian error feedback.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorHandler = inject(ErrorHandlerService);
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        // Handle 401 Unauthorized: Session has expired or token was revoked
        if (error.status === 401 && authService.getToken()) {
          authService.logout();
        }

        // Infer domain context from the requested API endpoint
        let context: ErrorRoleContext = 'GENERAL';
        const url = req.url.toLowerCase();

        if (url.includes('/api/auth')) {
          context = 'AUTH';
        } else if (url.includes('/api/appointments')) {
          // If staff user is logged in, treat as staff context; otherwise client
          const user = authService.currentUser();
          if (user && (authService.isAdmin(user) || authService.isBarber(user))) {
            context = authService.isAdmin(user) ? 'ADMIN' : 'BARBER';
          } else {
            context = 'CLIENT';
          }
        } else if (url.includes('/api/services') || url.includes('/api/admin')) {
          context = 'ADMIN';
        }

        // Normalize through error catalog
        errorHandler.handle(error, context);
      }

      return throwError(() => error);
    })
  );
};
