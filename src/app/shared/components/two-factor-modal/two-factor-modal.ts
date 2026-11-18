import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, TwoFactorSetupPayload } from '../../../core/services/auth.service';

// Reusable modal component for setting up TOTP 2FA via QR code or disabling active 2FA.
@Component({
  selector: 'app-two-factor-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './two-factor-modal.html',
  styleUrl: './two-factor-modal.scss',
})
export class TwoFactorModal {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);

  readonly isOpen = input.required<boolean>();
  readonly closed = output<void>();
  readonly statusChanged = output<string>();

  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly setupData = signal<TwoFactorSetupPayload | null>(null);
  readonly twoFactorEnabled = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly copiedSecret = signal(false);

  private wasOpen = false;

  readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  constructor() {
    effect(() => {
      const open = this.isOpen();
      if (open && !this.wasOpen) {
        this.wasOpen = true;
        untracked(() => {
          this.initializeModal();
        });
      } else if (!open) {
        this.wasOpen = false;
        untracked(() => {
          this.setupData.set(null);
          this.isLoading.set(false);
        });
      }
    });
  }

  private initializeModal(): void {
    this.errorMessage.set(null);
    this.copiedSecret.set(false);
    this.codeForm.reset({ code: '' });

    const currentlyEnabled = Boolean(this.authService.currentUser()?.twoFactorEnabled);
    this.twoFactorEnabled.set(currentlyEnabled);

    this.isLoading.set(true);
    this.authService.getTwoFactorStatusApi().subscribe({
      next: (status) => {
        this.twoFactorEnabled.set(status.twoFactorEnabled);
        if (!status.twoFactorEnabled) {
          this.loadQrSetup();
        } else {
          this.setupData.set(null);
          this.isLoading.set(false);
        }
      },
      error: () => {
        if (!currentlyEnabled) {
          this.loadQrSetup();
        } else {
          this.isLoading.set(false);
        }
      },
    });
  }

  loadQrSetup(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.setupTwoFactorApi().subscribe({
      next: (data) => {
        this.setupData.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Nu am putut genera codul QR 2FA. Verifică conexiunea la server.'
        );
      },
    });
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = digits;
    this.codeForm.controls.code.setValue(digits, { emitEvent: false });
  }

  copySecretKey(): void {
    const secret = this.setupData()?.secret;
    if (!secret || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(secret).then(() => {
      this.copiedSecret.set(true);
      setTimeout(() => this.copiedSecret.set(false), 2500);
    });
  }

  submitEnable(): void {
    this.errorMessage.set(null);
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { code } = this.codeForm.getRawValue();

    this.authService.enableTwoFactorApi(code).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.twoFactorEnabled.set(true);
        this.statusChanged.emit(
          res.message || 'Autentificarea în doi pași (2FA) a fost activată cu succes!'
        );
        this.close();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Codul introdus este invalid. Verifică aplicația Authenticator.'
        );
      },
    });
  }

  submitDisable(): void {
    this.errorMessage.set(null);
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { code } = this.codeForm.getRawValue();

    this.authService.disableTwoFactorApi(code).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.twoFactorEnabled.set(false);
        this.statusChanged.emit(
          res.message || 'Autentificarea în doi pași (2FA) a fost dezactivată.'
        );
        this.close();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          err?.error?.message || 'Codul introdus este invalid. Nu am putut dezactiva 2FA.'
        );
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
