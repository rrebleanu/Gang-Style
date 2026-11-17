import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserRole } from '../../core/services/auth.service';

// Login and registration component connected to the JWT authentication service.
@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class Auth {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  @ViewChild('registerEmailInput') registerEmailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('registerSection') registerSection?: ElementRef<HTMLElement>;

  readonly showRegister = signal(false);
  readonly showLoginPassword = signal(false);
  readonly showRegisterPassword = signal(false);

  readonly loginSubmitted = signal(false);
  readonly registerSubmitted = signal(false);
  readonly resetSubmitted = signal(false);
  readonly isSubmitting = signal(false);

  readonly forgotPasswordOpen = signal(false);
  readonly resetSuccessEmail = signal<string | null>(null);
  readonly authSuccessMessage = signal<string | null>(null);
  readonly authErrorMessage = signal<string | null>(null);

  readonly loginForm = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [true],
  });

  readonly registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly resetForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  toggleLoginPassword(): void {
    this.showLoginPassword.update((v) => !v);
  }

  toggleRegisterPassword(): void {
    this.showRegisterPassword.update((v) => !v);
  }

  openRegisterSection(): void {
    this.showRegister.set(true);
    this.authErrorMessage.set(null);

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.innerWidth <= 700) {
        this.registerSection?.nativeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
      this.registerEmailInput?.nativeElement.focus();
    }, 120);
  }

  // Submits login credentials and stores the received JWT token.
  onLoginSubmit(): void {
    this.loginSubmitted.set(true);
    this.authErrorMessage.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { identifier, password } = this.loginForm.getRawValue();

    this.authService.loginApi(identifier, password).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        this.authSuccessMessage.set(`Bine ai revenit, ${user.displayName}!`);
        this.redirectAfterAuth(user.role);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg =
          err?.error?.message || 'Emailul sau parola introdusă este incorectă.';
        this.authErrorMessage.set(msg);
      },
    });
  }

  // Registers a new client account and logs the user in automatically.
  onRegisterSubmit(): void {
    this.registerSubmitted.set(true);
    this.authErrorMessage.set(null);

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { email, password } = this.registerForm.getRawValue();

    this.authService.registerApi({ email, password }).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        this.authSuccessMessage.set(
          `Cont creat cu succes! Ești conectat automat ca ${user.email}.`
        );
        this.redirectAfterAuth(user.role);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const msg =
          err?.error?.message ||
          'Nu am putut crea contul. Verifică dacă adresa de email este deja folosită.';
        this.authErrorMessage.set(msg);
      },
    });
  }

  toggleForgotPassword(): void {
    this.forgotPasswordOpen.update((v) => !v);
    this.resetSuccessEmail.set(null);
    this.resetSubmitted.set(false);
  }

  onResetSubmit(): void {
    this.resetSubmitted.set(true);
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetSuccessEmail.set(this.resetForm.controls.email.value.trim());
    this.resetForm.reset();
    this.resetSubmitted.set(false);
  }

  hasLoginError(controlName: 'identifier' | 'password'): boolean {
    const control = this.loginForm.controls[controlName];
    return control.invalid && (control.touched || this.loginSubmitted());
  }

  hasRegisterError(controlName: 'email' | 'password'): boolean {
    const control = this.registerForm.controls[controlName];
    return control.invalid && (control.touched || this.registerSubmitted());
  }

  hasResetError(): boolean {
    const control = this.resetForm.controls.email;
    return control.invalid && (control.touched || this.resetSubmitted());
  }

  private redirectAfterAuth(_role: UserRole): void {
    setTimeout(() => {
      this.router.navigate(['/']);
    }, 500);
  }
}
