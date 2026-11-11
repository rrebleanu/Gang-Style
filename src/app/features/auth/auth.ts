import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Login & Registration page (/login).
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

  // Controls whether the Registration section is visible
  readonly showRegister = signal(false);

  // Password visibility toggles
  readonly showLoginPassword = signal(false);
  readonly showRegisterPassword = signal(false);

  // Submission states for validation feedback
  readonly loginSubmitted = signal(false);
  readonly registerSubmitted = signal(false);
  readonly resetSubmitted = signal(false);

  // UI feedback states
  readonly forgotPasswordOpen = signal(false);
  readonly resetSuccessEmail = signal<string | null>(null);
  readonly authSuccessMessage = signal<string | null>(null);

  // Login form
  readonly loginForm = this.fb.nonNullable.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [true],
  });

  // Registration form (email + password so user is logged in immediately)
  readonly registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  // Forgot password form
  readonly resetForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  toggleLoginPassword(): void {
    this.showLoginPassword.update((v) => !v);
  }

  toggleRegisterPassword(): void {
    this.showRegisterPassword.update((v) => !v);
  }

  // Reveals the Registration section when user clicks "Nu ai cont? Înregistrează-te"
  openRegisterSection(): void {
    this.showRegister.set(true);

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

  onLoginSubmit(): void {
    this.loginSubmitted.set(true);
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { identifier, password } = this.loginForm.getRawValue();
    const user = this.authService.login(identifier, password);

    this.authSuccessMessage.set(`Bine ai revenit, ${user.displayName}!`);
    this.redirectAfterAuth(user.role);
  }

  // Creates account and automatically logs the user in
  onRegisterSubmit(): void {
    this.registerSubmitted.set(true);
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.registerForm.getRawValue();
    const user = this.authService.registerAndLogin(email, password);

    this.authSuccessMessage.set(
      `Cont creat cu succes! Ești conectat automat ca ${user.email}.`
    );
    this.redirectAfterAuth(user.role);
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

  private redirectAfterAuth(role: 'CLIENT' | 'BARBER' | 'ADMIN'): void {
    setTimeout(() => {
      if (role === 'ADMIN') {
        this.router.navigate(['/admin']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    }, 800);
  }
}
