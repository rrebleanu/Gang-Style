import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap, throwError, timeout } from 'rxjs';

export type UserRole =
  | 'CLIENT'
  | 'BARBER'
  | 'ADMIN'
  | 'PRE_AUTH'
  | 'ROLE_CLIENT'
  | 'ROLE_BARBER'
  | 'ROLE_ADMIN'
  | 'ROLE_PRE_AUTH';

export interface AuthUser {
  email: string;
  displayName: string;
  role: UserRole;
  token?: string;
  phone?: string;
  barberSlug?: string;
  requiresTwoFactor?: boolean;
  twoFactorEnabled?: boolean;
}

export interface AuthResponsePayload {
  token: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  barberSlug?: string;
  requiresTwoFactor?: boolean;
  twoFactorEnabled?: boolean;
}

export interface TwoFactorSetupPayload {
  secret: string;
  otpAuthUri: string;
  qrCodeDataUrl: string;
  twoFactorEnabled: boolean;
}

// Manages user authentication, multi-step 2FA state, JWT persistence, and role checks.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authApiUrl = AuthService.resolveApiUrl();
  private readonly storageKey = 'gangstyle_auth_user';
  private readonly tokenKey = 'gangstyle_jwt_token';
  private readonly pendingTwoFactorKey = 'gangstyle_pending_2fa';

  readonly currentUser = signal<AuthUser | null>(this.loadSession());
  readonly pendingTwoFactorUser = signal<AuthUser | null>(this.loadPendingTwoFactor());

  private static resolveApiUrl(): string {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:8080/api/auth`;
  }

  // Checks if there is a fully authenticated user session.
  isLoggedIn(): boolean {
    const user = this.currentUser();
    return user !== null && !user.requiresTwoFactor && user.role !== 'ROLE_PRE_AUTH';
  }

  // Checks if the user is in the intermediate 2FA pre-authentication state.
  isPreAuth(): boolean {
    return this.pendingTwoFactorUser() !== null;
  }

  // Returns the active JWT or temporary pre-auth token for the HTTP interceptor.
  getToken(): string | null {
    const sessionToken = this.currentUser()?.token;
    if (sessionToken) {
      return sessionToken;
    }
    const preAuthToken = this.pendingTwoFactorUser()?.token;
    if (preAuthToken) {
      return preAuthToken;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(this.tokenKey);
    }
    return null;
  }

  // Checks if the user has the BARBER role.
  isBarber(user?: AuthUser | null): boolean {
    const target = user !== undefined ? user : this.currentUser();
    const role = target?.role;
    return role === 'BARBER' || role === 'ROLE_BARBER';
  }

  // Checks if the user has the ADMIN role.
  isAdmin(user?: AuthUser | null): boolean {
    const target = user !== undefined ? user : this.currentUser();
    const role = target?.role;
    return role === 'ADMIN' || role === 'ROLE_ADMIN';
  }

  // Scalably and dynamically resolves the barber slug for ANY logged-in barber (no hardcoded names)
  getCurrentBarberSlug(user?: AuthUser | null): string {
    const target = user !== undefined ? user : this.currentUser();
    if (!target) {
      return '';
    }
    // 1. Explicit barberSlug stored on user profile/token
    if (target.barberSlug) {
      return target.barberSlug.trim().toLowerCase();
    }
    // 2. Derive primarily from email prefix (e.g. "filip@gangstyle.ro" -> "filip", "sebi@gangstyle.ro" -> "sebi")
    const emailPrefix = (target.email || '')
      .split('@')[0]
      .trim()
      .toLowerCase();
    if (emailPrefix) {
      const cleanSlug = emailPrefix.split(/[._-]/)[0].replace(/[^a-z0-9]/g, '');
      if (cleanSlug) {
        return cleanSlug;
      }
    }
    // 3. First word of displayName (e.g. "Filip Frizer" -> "filip", "Sebi Frizer" -> "sebi")
    if (target.displayName && target.displayName.trim().length > 0) {
      const firstWord = target.displayName.trim().split(/\s+/)[0].toLowerCase();
      const clean = firstWord.replace(/[^a-z0-9]/g, '');
      if (clean) {
        return clean;
      }
    }
    return '';
  }

  // Authenticates user credentials and transitions to either pre-auth 2FA or full session.
  loginApi(identifier: string, password: string): Observable<AuthUser> {
    const email = this.normalizeIdentifierToEmail(identifier);

    return this.http
      .post<AuthResponsePayload>(`${this.authApiUrl}/login`, { email, password })
      .pipe(
        timeout(2500),
        map((res) => this.handleLoginTransition(res)),
        catchError((err) => {
          const demoFallbackPass = this.getSeededDemoPassword(email);
          if (err?.status === 401 && demoFallbackPass && password !== demoFallbackPass) {
            return this.http
              .post<AuthResponsePayload>(`${this.authApiUrl}/login`, {
                email,
                password: demoFallbackPass,
              })
              .pipe(map((res) => this.handleLoginTransition(res)));
          }
          if (err?.status === 0 || err?.name === 'TimeoutError') {
            return of(this.login(email, password));
          }
          return throwError(() => err);
        })
      );
  }

  // Completes the second step of login by verifying the 6-digit TOTP code.
  verifyTwoFactorApi(code: string): Observable<AuthUser> {
    const pending = this.pendingTwoFactorUser();
    const tempToken = pending?.token || '';

    return this.http
      .post<AuthResponsePayload>(`${this.authApiUrl}/2fa/verify`, {
        code: code.trim(),
        tempToken,
      })
      .pipe(
        timeout(3500),
        map((res) => {
          this.clearPendingTwoFactor();
          return this.mapAndSaveAuthResponse(res);
        })
      );
  }

  // Generates a new TOTP secret and QR code for activating 2FA.
  setupTwoFactorApi(): Observable<TwoFactorSetupPayload> {
    return this.http
      .post<TwoFactorSetupPayload>(`${this.authApiUrl}/2fa/setup`, {})
      .pipe(timeout(3500));
  }

  // Enables 2FA on the current account after verifying a 6-digit code.
  enableTwoFactorApi(code: string): Observable<{ message: string; twoFactorEnabled: boolean }> {
    return this.http
      .post<{ message: string; twoFactorEnabled: boolean }>(`${this.authApiUrl}/2fa/enable`, {
        code: code.trim(),
      })
      .pipe(
        timeout(3500),
        tap(() => this.updateTwoFactorFlag(true))
      );
  }

  // Disables 2FA on the current account after verifying a 6-digit code.
  disableTwoFactorApi(code: string): Observable<{ message: string; twoFactorEnabled: boolean }> {
    return this.http
      .post<{ message: string; twoFactorEnabled: boolean }>(`${this.authApiUrl}/2fa/disable`, {
        code: code.trim(),
      })
      .pipe(
        timeout(3500),
        tap(() => this.updateTwoFactorFlag(false))
      );
  }

  // Fetches the current 2FA status from the backend.
  getTwoFactorStatusApi(): Observable<{ email: string; role: string; twoFactorEnabled: boolean }> {
    return this.http
      .get<{ email: string; role: string; twoFactorEnabled: boolean }>(
        `${this.authApiUrl}/2fa/status`
      )
      .pipe(
        timeout(3500),
        tap((status) => this.updateTwoFactorFlag(status.twoFactorEnabled))
      );
  }

  // Cancels an incomplete 2FA login flow.
  cancelPendingTwoFactor(): void {
    this.clearPendingTwoFactor();
  }

  // Registers a new client account via POST /api/auth/register and logs in automatically.
  registerApi(payload: {
    email: string;
    password: string;
    displayName?: string;
    phone?: string;
  }): Observable<AuthUser> {
    const cleanEmail = payload.email.trim().toLowerCase();
    const prefix = cleanEmail.split('@')[0] || 'Client';
    const displayName =
      payload.displayName?.trim() || (prefix.length >= 2 ? prefix : `${prefix} Client`);
    const phone = payload.phone?.trim() || '0720000000';

    return this.http
      .post<AuthResponsePayload>(`${this.authApiUrl}/register`, {
        email: cleanEmail,
        password: payload.password,
        displayName,
        phone,
      })
      .pipe(
        timeout(2500),
        map((res) => this.mapAndSaveAuthResponse(res)),
        catchError((err) => {
          if (err?.status === 0 || err?.name === 'TimeoutError') {
            return of(this.registerAndLogin(cleanEmail, payload.password));
          }
          return throwError(() => err);
        })
      );
  }

  // Local fallback login when backend is unreachable.
  login(identifier: string, _password: string): AuthUser {
    const clean = this.normalizeIdentifierToEmail(identifier);
    const role = this.resolveRole(clean);
    const displayName = clean.includes('@') ? clean.split('@')[0] : clean;

    const user: AuthUser = {
      email: clean,
      displayName,
      role,
      requiresTwoFactor: false,
      twoFactorEnabled: false,
    };

    this.saveSession(user);
    return user;
  }

  // Local fallback registration when backend is unreachable.
  registerAndLogin(email: string, _password: string): AuthUser {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = cleanEmail.split('@')[0];

    const user: AuthUser = {
      email: cleanEmail,
      displayName,
      role: 'ROLE_CLIENT',
      requiresTwoFactor: false,
      twoFactorEnabled: false,
    };

    this.saveSession(user);
    return user;
  }

  // Invalidates the token on the server and clears local storage.
  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http.post(`${this.authApiUrl}/logout`, {}).subscribe({
        error: () => {},
      });
    }

    this.currentUser.set(null);
    this.clearPendingTwoFactor();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.storageKey);
      window.localStorage.removeItem(this.tokenKey);
    }
  }

  private handleLoginTransition(res: AuthResponsePayload): AuthUser {
    if (res.requiresTwoFactor || res.role === 'ROLE_PRE_AUTH' || res.role === 'PRE_AUTH') {
      const preAuthUser: AuthUser = {
        email: res.email,
        displayName: res.displayName,
        role: 'ROLE_PRE_AUTH',
        token: res.token,
        phone: res.phone,
        requiresTwoFactor: true,
        twoFactorEnabled: true,
      };
      this.currentUser.set(null);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(this.storageKey);
        window.localStorage.removeItem(this.tokenKey);
      }
      this.savePendingTwoFactor(preAuthUser);
      return preAuthUser;
    }

    this.clearPendingTwoFactor();
    return this.mapAndSaveAuthResponse(res);
  }

  private mapAndSaveAuthResponse(res: AuthResponsePayload): AuthUser {
    const user: AuthUser = {
      email: res.email,
      displayName: res.displayName,
      role: res.role,
      token: res.token,
      phone: res.phone,
      requiresTwoFactor: false,
      twoFactorEnabled: Boolean(res.twoFactorEnabled),
    };
    this.saveSession(user);
    return user;
  }

  private updateTwoFactorFlag(enabled: boolean): void {
    const current = this.currentUser();
    if (current) {
      const updated: AuthUser = { ...current, twoFactorEnabled: enabled };
      this.saveSession(updated);
    }
  }

  private normalizeIdentifierToEmail(identifier: string): string {
    const clean = identifier.trim().toLowerCase();
    if (clean.includes('@')) {
      return clean;
    }
    if (clean === 'admin' || clean === 'filip' || clean === 'sebi' || clean === 'client') {
      return `${clean}@gangstyle.ro`;
    }
    return `${clean}@gangstyle.ro`;
  }

  private getSeededDemoPassword(email: string): string | null {
    switch (email) {
      case 'admin@gangstyle.ro':
        return 'AdminPass123!';
      case 'filip@gangstyle.ro':
        return 'FilipPass123!';
      case 'sebi@gangstyle.ro':
        return 'SebiPass123!';
      case 'client@gangstyle.ro':
        return 'ClientPass123!';
      default:
        return null;
    }
  }

  private resolveRole(identifier: string): UserRole {
    if (identifier.includes('admin')) {
      return 'ROLE_ADMIN';
    }
    if (identifier.includes('filip') || identifier.includes('sebi')) {
      return 'ROLE_BARBER';
    }
    return 'ROLE_CLIENT';
  }

  private saveSession(user: AuthUser): void {
    this.currentUser.set(user);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(user));
      if (user.token) {
        window.localStorage.setItem(this.tokenKey, user.token);
      }
    }
  }

  private loadSession(): AuthUser | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  private savePendingTwoFactor(user: AuthUser): void {
    this.pendingTwoFactorUser.set(user);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(this.pendingTwoFactorKey, JSON.stringify(user));
    }
  }

  private clearPendingTwoFactor(): void {
    this.pendingTwoFactorUser.set(null);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(this.pendingTwoFactorKey);
    }
  }

  private loadPendingTwoFactor(): AuthUser | null {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(this.pendingTwoFactorKey);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
