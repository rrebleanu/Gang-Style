import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  email: string;
  displayName: string;
  role: 'CLIENT' | 'BARBER' | 'ADMIN';
}

// Manages user authentication state and persists session in localStorage.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'gangstyle_auth_user';
  private readonly usersKey = 'gangstyle_registered_users';

  readonly currentUser = signal<AuthUser | null>(this.loadSession());

  // Logs in an existing user or demo staff account
  login(identifier: string, _password: string): AuthUser {
    const clean = identifier.trim().toLowerCase();
    const role = this.resolveRole(clean);
    const displayName = clean.includes('@') ? clean.split('@')[0] : clean;

    const user: AuthUser = {
      email: clean,
      displayName,
      role,
    };

    this.saveSession(user);
    return user;
  }

  // Public registration ALWAYS creates a standard CLIENT account (never BARBER or ADMIN)
  registerAndLogin(email: string, password: string): AuthUser {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = cleanEmail.split('@')[0];

    // Save registered client account in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const existingRaw = window.localStorage.getItem(this.usersKey);
      const list: { email: string; password: string }[] = existingRaw
        ? JSON.parse(existingRaw)
        : [];
      const filtered = list.filter((u) => u.email !== cleanEmail);
      filtered.push({ email: cleanEmail, password });
      window.localStorage.setItem(this.usersKey, JSON.stringify(filtered));
    }

    const user: AuthUser = {
      email: cleanEmail,
      displayName,
      role: 'CLIENT',
    };

    this.saveSession(user);
    return user;
  }

  logout(): void {
    this.currentUser.set(null);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.storageKey);
    }
  }

  private resolveRole(identifier: string): 'CLIENT' | 'BARBER' | 'ADMIN' {
    if (identifier.includes('admin')) {
      return 'ADMIN';
    }
    if (identifier.includes('filip') || identifier.includes('sebi')) {
      return 'BARBER';
    }
    return 'CLIENT';
  }

  private saveSession(user: AuthUser): void {
    this.currentUser.set(user);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(user));
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
}
