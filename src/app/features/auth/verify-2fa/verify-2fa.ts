import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ErrorHandlerService } from '../../../core/services/error-handler.service';

// Step-two verification component (/verify-2fa) for TOTP two-factor authentication.
@Component({
  selector: 'app-verify-2fa',
  imports: [ReactiveFormsModule],
  templateUrl: './verify-2fa.html',
  styleUrl: './verify-2fa.scss',
})
export class VerifyTwoFactor implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);
  private readonly errorHandler = inject(ErrorHandlerService);

  readonly submitted = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly verifyForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate([this.authService.isAdmin() ? '/admin' : '/dashboard']);
      return;
    }
    if (!this.authService.isPreAuth()) {
      this.router.navigate(['/login']);
    }
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = digitsOnly;
    this.verifyForm.controls.code.setValue(digitsOnly, { emitEvent: false });
  }

  onVerifySubmit(): void {
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { code } = this.verifyForm.getRawValue();

    this.authService.verifyTwoFactorApi(code).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        const cleanName = this.authService.sanitizeDisplayName(user.displayName);
        this.successMessage.set(
          `Autentificare confirmată! Bine ai revenit, ${cleanName}.`
        );
        setTimeout(() => {
          const target = this.authService.isAdmin(user) ? '/admin' : '/dashboard';
          this.router.navigate([target]);
        }, 450);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const appError = this.errorHandler.handleAuthError(err);
        this.errorMessage.set(appError.message);
      },
    });
  }

  backToLogin(): void {
    this.authService.cancelPendingTwoFactor();
    this.router.navigate(['/login']);
  }

  hasCodeError(): boolean {
    const control = this.verifyForm.controls.code;
    return control.invalid && (control.touched || this.submitted());
  }
}
