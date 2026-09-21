import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { CurrentUser, UserRole, UserStatus } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-user-approval',
  standalone: true,
  imports: [MatButtonModule, MatMenuModule, MatSnackBarModule, MatProgressSpinnerModule, IconComponent],
  templateUrl: './user-approval.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './user-approval.component.scss',
})
export class UserApprovalComponent {
  private readonly adminUsers = inject(AdminUsersService);
  private readonly snackBar = inject(MatSnackBar);

  readonly statuses: UserStatus[] = ['pending', 'approved', 'rejected'];
  readonly statusLabels: Record<UserStatus, string> = {
    pending: 'Pendientes',
    approved: 'Aprobados',
    rejected: 'Rechazados',
  };
  readonly roles: UserRole[] = ['admin', 'coach', 'member'];

  readonly selectedStatus = signal<UserStatus>('pending');
  readonly users = signal<CurrentUser[]>([]);
  readonly loading = signal(false);

  // Shown as a badge on the "Pendientes" tab regardless of which tab is
  // currently selected — fetched independently of the tab's own list so it
  // doesn't go stale while looking at Aprobados/Rechazados.
  readonly pendingCount = signal(0);

  constructor() {
    this.load();
    this.refreshPendingCount();
  }

  selectStatus(status: UserStatus) {
    this.selectedStatus.set(status);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.adminUsers.list(this.selectedStatus()).subscribe({
      next: (res) => {
        this.users.set(res.users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private refreshPendingCount() {
    this.adminUsers.list('pending').subscribe((res) => this.pendingCount.set(res.users.length));
  }

  private showError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  approve(user: CurrentUser) {
    this.adminUsers.approve(user.id).subscribe({
      next: () => {
        this.snackBar.open(`${user.name} aprobado`, 'Cerrar', { duration: 3000 });
        this.load();
        this.refreshPendingCount();
      },
      error: (err) => this.showError(err, `No se pudo aprobar a ${user.name}`),
    });
  }

  reject(user: CurrentUser) {
    this.adminUsers.reject(user.id).subscribe({
      next: () => {
        this.snackBar.open(`${user.name} rechazado`, 'Cerrar', { duration: 3000 });
        this.load();
        this.refreshPendingCount();
      },
      error: (err) => this.showError(err, `No se pudo rechazar a ${user.name}`),
    });
  }

  /** Generates the one-use link and copies it to the clipboard so the admin
   * can paste it straight into WhatsApp — there is no mailer, delivery is
   * manual by design (see auth.service.ts). */
  resetLink(user: CurrentUser) {
    this.adminUsers.createResetLink(user.id).subscribe({
      next: async ({ token, expiresInMinutes }) => {
        const url = `${location.origin}/reset-password?token=${token}`;
        try {
          await navigator.clipboard.writeText(url);
          this.snackBar.open(`Enlace copiado (caduca en ${expiresInMinutes} min)`, 'Cerrar', {
            duration: 5000,
          });
        } catch {
          // Clipboard needs a secure context / permission; fall back to
          // showing the link so the admin can still select and copy it.
          this.snackBar.open(url, 'Cerrar', { duration: 20000 });
        }
        this.load();
      },
      error: (err) => this.showError(err, `No se pudo generar el enlace para ${user.name}`),
    });
  }

  changeRole(user: CurrentUser, role: UserRole) {
    if (role === user.role) return;
    this.adminUsers.updateRole(user.id, role).subscribe({
      next: () => {
        this.snackBar.open(`Rol de ${user.name} actualizado a ${role}`, 'Cerrar', { duration: 3000 });
        this.load();
      },
      error: (err) => this.showError(err, `No se pudo actualizar el rol de ${user.name}`),
    });
  }
}
