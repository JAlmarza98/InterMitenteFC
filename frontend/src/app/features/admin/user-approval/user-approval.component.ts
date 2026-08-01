import { Component, inject, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { CurrentUser, UserRole, UserStatus } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-approval',
  standalone: true,
  imports: [
    MatTableModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './user-approval.component.html',
  styleUrl: './user-approval.component.scss',
})
export class UserApprovalComponent {
  private readonly adminUsers = inject(AdminUsersService);
  private readonly snackBar = inject(MatSnackBar);

  readonly statuses: UserStatus[] = ['pending', 'approved', 'rejected'];
  readonly roles: UserRole[] = ['admin', 'coach', 'member'];
  readonly displayedColumns = ['name', 'email', 'role', 'actions'];

  readonly selectedStatus = signal<UserStatus>('pending');
  readonly users = signal<CurrentUser[]>([]);
  readonly loading = signal(false);

  constructor() {
    this.load();
  }

  onTabChange(index: number) {
    this.selectedStatus.set(this.statuses[index]);
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

  approve(user: CurrentUser) {
    this.adminUsers.approve(user.id).subscribe(() => {
      this.snackBar.open(`${user.name} aprobado`, 'Cerrar', { duration: 3000 });
      this.load();
    });
  }

  reject(user: CurrentUser) {
    this.adminUsers.reject(user.id).subscribe(() => {
      this.snackBar.open(`${user.name} rechazado`, 'Cerrar', { duration: 3000 });
      this.load();
    });
  }

  changeRole(user: CurrentUser, role: UserRole) {
    this.adminUsers.updateRole(user.id, role).subscribe(() => {
      this.snackBar.open(`Rol de ${user.name} actualizado a ${role}`, 'Cerrar', { duration: 3000 });
      this.load();
    });
  }
}
