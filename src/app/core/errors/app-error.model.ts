/**
 * Represents the context/perspective in which an error occurred on the Gang Style platform.
 * Allows tailoring error messages specifically for Clients, Barbers, Admins, or Auth flows.
 */
export type ErrorRoleContext = 'CLIENT' | 'BARBER' | 'ADMIN' | 'AUTH' | 'GENERAL';

/**
 * High-level categorization of errors across the application.
 */
export type ErrorCategory =
  | 'BOOKING'
  | 'AUTH'
  | 'PORTAL_CLIENT'
  | 'PORTAL_BARBER'
  | 'PORTAL_ADMIN'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER'
  | 'GENERAL';

/**
 * Standardized application error model for consistent UI feedback across all components.
 */
export interface AppError {
  /** HTTP status code (e.g. 400, 401, 403, 404, 409, 429, 500) or 0 for offline/network failure */
  status: number;

  /** Human-readable short title displayed in alert banners or modal headers */
  title: string;

  /** Friendly, actionable message explained in clear Romanian */
  message: string;

  /** Actionable recommendation for the user (e.g., "Alege altă oră", "Reîmprospătează pagina") */
  actionSuggestion?: string;

  /** Key-value pairs for form field validation errors returned by Spring Boot */
  fieldErrors?: Record<string, string>;

  /** Domain category of the error */
  category: ErrorCategory;

  /** Original raw error object for debugging purposes */
  raw?: unknown;
}
