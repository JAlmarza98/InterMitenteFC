import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { passwordsMatch } from '../passwords-match.validator';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './change-password.component.html',
})
export class ChangePasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly done = signal(false);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
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
    const { currentPassword, password } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
        this.form.reset();
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 400 ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.'
        );
      },
    });
  }
}
