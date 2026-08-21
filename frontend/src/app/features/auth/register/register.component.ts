import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

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
    const { name, email, password } = this.form.getRawValue();

    this.auth.register(email, password, name).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/login', { state: { registered: true } });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 409 ? 'Ya existe una cuenta con ese email.' : 'No se pudo completar el registro.'
        );
      },
    });
  }
}
