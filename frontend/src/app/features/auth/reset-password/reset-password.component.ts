import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { passwordsMatch } from '../passwords-match.validator';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  /** The one-use token from the link the admin handed over. */
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly done = signal(false);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch('password', 'confirm') }
  );

  togglePasswordVisibility() {
    this.showPassword.set(!this.showPassword());
  }

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.resetPassword(this.token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 400
            ? 'El enlace no es válido o ha caducado. Pide uno nuevo.'
            : 'No se pudo cambiar la contraseña.'
        );
      },
    });
  }
}
