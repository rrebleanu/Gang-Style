import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { AppError, ErrorCategory, ErrorRoleContext } from '../errors/app-error.model';
import { ERROR_CATALOG, resolveCategoryForContext } from '../errors/error-catalog';

/**
 * Centralized Application Error Handler Service for Gang Style.
 * 
 * Provides unified, role-aware, and actionable error normalization across the entire application:
 * - Translates low-level HTTP status codes into friendly Romanian explanations.
 * - Extracts and structures Spring Boot backend validation field errors.
 * - Differentiates contexts for Clients (Anti-IDOR, booking race conditions),
 *   Barbers (scheduling conflicts, unauthorized edits), Admins (catalog validation),
 *   and Authentication (2FA, brute-force rate limits).
 */
@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {
  /**
   * Tracks the latest processed application error for reactive UI banners or debug panels.
   */
  readonly lastError = signal<AppError | null>(null);

  /**
   * Primary entry point: Normalizes any raw error (HTTP response, JS Error, or string)
   * into a strongly typed and user-friendly AppError object.
   *
   * @param error Raw error object thrown by Angular HTTP or browser runtime.
   * @param context Role/domain context (CLIENT, BARBER, ADMIN, AUTH, GENERAL).
   * @returns Standardized AppError with friendly title, message, and action suggestion.
   */
  handle(error: unknown, context: ErrorRoleContext = 'GENERAL'): AppError {
    const appError = this.buildAppError(error, context);
    this.lastError.set(appError);
    return appError;
  }

  /**
   * Convenience helper for public booking flow errors (e.g. race conditions, 14-day horizon).
   */
  handleBookingError(error: unknown): AppError {
    return this.handle(error, 'CLIENT');
  }

  /**
   * Convenience helper for authentication errors (login, registration, 2FA code, password reset).
   */
  handleAuthError(error: unknown): AppError {
    return this.handle(error, 'AUTH');
  }

  /**
   * Convenience helper for Client Portal errors (Anti-IDOR check, personal appointment rescheduling).
   */
  handleClientPortalError(error: unknown): AppError {
    return this.handle(error, 'CLIENT');
  }

  /**
   * Convenience helper for Barber Portal errors (blocking schedules, setting vacations, daily agenda).
   */
  handleBarberPortalError(error: unknown): AppError {
    return this.handle(error, 'BARBER');
  }

  /**
   * Convenience helper for Admin Portal errors (service pricing, barber assignments, global settings).
   */
  handleAdminPortalError(error: unknown): AppError {
    return this.handle(error, 'ADMIN');
  }

  /**
   * Formats a raw error into a single friendly display string (e.g., for simple alert toasts).
   */
  formatMessage(error: unknown, context: ErrorRoleContext = 'GENERAL'): string {
    const parsed = this.buildAppError(error, context);
    if (parsed.actionSuggestion) {
      return `${parsed.message} (${parsed.actionSuggestion})`;
    }
    return parsed.message;
  }

  /**
   * Clears the current tracked error.
   */
  clearError(): void {
    this.lastError.set(null);
  }

  /**
   * Internal parser decomposing HTTP response payloads and matching catalog definitions.
   */
  private buildAppError(error: unknown, context: ErrorRoleContext): AppError {
    const category = resolveCategoryForContext(context);

    // Case 1: Angular HttpClient HttpErrorResponse
    if (error instanceof HttpErrorResponse) {
      return this.parseHttpError(error, context, category);
    }

    // Case 2: Standard JavaScript Error (thrown manually or via client validations)
    if (error instanceof Error) {
      return {
        status: 400,
        title: 'Atenție',
        message: error.message,
        actionSuggestion: 'Verifică datele introduse și încearcă din nou.',
        category,
        raw: error,
      };
    }

    // Case 3: Simple string or unexpected unknown payload
    if (typeof error === 'string') {
      return {
        status: 400,
        title: 'Notificare',
        message: error,
        category,
        raw: error,
      };
    }

    // Fallback: Generic unexpected system error
    return {
      status: 500,
      title: ERROR_CATALOG.NETWORK.SERVER_ERROR.title,
      message: ERROR_CATALOG.NETWORK.SERVER_ERROR.message,
      actionSuggestion: ERROR_CATALOG.NETWORK.SERVER_ERROR.actionSuggestion,
      category: 'SERVER',
      raw: error,
    };
  }

  /**
   * Dissects an HttpErrorResponse, checking for Spring Boot ApiErrorResponse payloads,
   * Anti-IDOR 403 Forbidden messages, race condition 409 Conflicts, and network status 0.
   */
  private parseHttpError(
    err: HttpErrorResponse,
    context: ErrorRoleContext,
    category: ErrorCategory
  ): AppError {
    const status = err.status;

    // Handle Network Disconnection or Server Down (HTTP status 0)
    if (status === 0) {
      return {
        status: 0,
        title: ERROR_CATALOG.NETWORK.OFFLINE.title,
        message: ERROR_CATALOG.NETWORK.OFFLINE.message,
        actionSuggestion: ERROR_CATALOG.NETWORK.OFFLINE.actionSuggestion,
        category: 'NETWORK',
        raw: err,
      };
    }

    // Handle 503 Service Unavailable / Maintenance
    if (status === 503) {
      return {
        status: 503,
        title: ERROR_CATALOG.NETWORK.MAINTENANCE.title,
        message: ERROR_CATALOG.NETWORK.MAINTENANCE.message,
        actionSuggestion: ERROR_CATALOG.NETWORK.MAINTENANCE.actionSuggestion,
        category: 'SERVER',
        raw: err,
      };
    }

    // Handle 500 Internal Server Error
    if (status >= 500) {
      return {
        status,
        title: ERROR_CATALOG.NETWORK.SERVER_ERROR.title,
        message: ERROR_CATALOG.NETWORK.SERVER_ERROR.message,
        actionSuggestion: ERROR_CATALOG.NETWORK.SERVER_ERROR.actionSuggestion,
        category: 'SERVER',
        raw: err,
      };
    }

    // Extract Spring Boot ApiErrorResponse payload if available
    const backendPayload = err.error;
    const backendMessage =
      typeof backendPayload === 'object' && backendPayload !== null && 'message' in backendPayload
        ? (backendPayload.message as string)
        : null;

    const fieldErrors =
      typeof backendPayload === 'object' &&
      backendPayload !== null &&
      'fieldErrors' in backendPayload &&
      typeof backendPayload.fieldErrors === 'object'
        ? (backendPayload.fieldErrors as Record<string, string>)
        : undefined;

    // Look up role-specific catalog entry first, then fallback to general catalog
    const catalogEntry = this.lookupCatalog(status, context);

    // If backend provided a specific human-readable message (e.g. from Anti-IDOR check or conflict),
    // prioritize the exact backend message for high precision while using catalog title & suggestions.
    const finalMessage = backendMessage && backendMessage.trim().length > 0
      ? backendMessage
      : catalogEntry.message;

    return {
      status,
      title: catalogEntry.title,
      message: finalMessage,
      actionSuggestion: catalogEntry.actionSuggestion,
      fieldErrors,
      category,
      raw: err,
    };
  }

  /**
   * Retrieves matching title, message, and suggestion from ERROR_CATALOG based on HTTP status and context.
   */
  private lookupCatalog(
    status: number,
    context: ErrorRoleContext
  ): { title: string; message: string; actionSuggestion?: string } {
    switch (context) {
      case 'AUTH': {
        const entry = ERROR_CATALOG.AUTH[status];
        if (entry) return entry;
        break;
      }
      case 'CLIENT': {
        const entry = ERROR_CATALOG.PORTAL_CLIENT[status] || ERROR_CATALOG.BOOKING[status];
        if (entry) return entry;
        break;
      }
      case 'BARBER': {
        const entry = ERROR_CATALOG.PORTAL_BARBER[status];
        if (entry) return entry;
        break;
      }
      case 'ADMIN': {
        const entry = ERROR_CATALOG.PORTAL_ADMIN[status];
        if (entry) return entry;
        break;
      }
      default:
        break;
    }

    // Fallback descriptors for unmapped status codes
    switch (status) {
      case 400:
        return {
          title: 'Cerere Invalidă',
          message: 'Datele transmise nu au putut fi procesate. Verifică formularul.',
          actionSuggestion: 'Asigură-te că toate câmpurile obligatorii sunt corect completate.',
        };
      case 401:
        return {
          title: 'Sesiune Expirată',
          message: 'Sesiunea ta de autentificare a expirat sau datele de conectare sunt incorecte.',
          actionSuggestion: 'Te rugăm să te autentifici din nou.',
        };
      case 403:
        return {
          title: 'Acces Respins',
          message: 'Nu ai permisiunea necesară pentru a efectua această acțiune (Protecție de securitate).',
          actionSuggestion: 'Verifică contul cu care ești conectat.',
        };
      case 404:
        return {
          title: 'Resursă Negăsită',
          message: 'Elementul căutat nu a fost găsit pe server.',
          actionSuggestion: 'Reîmprospătează pagina pentru a sincroniza datele.',
        };
      case 409:
        return {
          title: 'Conflict de Date',
          message: 'A apărut o suprapunere sau o modificare simultană pe server.',
          actionSuggestion: 'Reîmprospătează datele și încearcă din nou.',
        };
      case 429:
        return {
          title: 'Prea Multe Solicitări',
          message: 'Ai trimis prea multe comenzi într-un interval scurt de timp.',
          actionSuggestion: 'Te rugăm să aștepți un moment înainte de a reîncerca.',
        };
      default:
        return {
          title: `Eroare (${status})`,
          message: 'A apărut o problemă la procesarea cererii tale.',
          actionSuggestion: 'Reîncearcă în câteva momente.',
        };
    }
  }
}
