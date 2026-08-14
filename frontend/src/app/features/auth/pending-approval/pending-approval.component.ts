import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './pending-approval.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pending-approval.component.scss',
})
export class PendingApprovalComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly checking = signal(false);
  readonly status = this.auth.user;

  refresh() {
    this.checking.set(true);
    this.auth.fetchMe().subscribe(({ user }) => {
      this.checking.set(false);
      if (user?.status === 'approved') {
        this.router.navigateByUrl('/');
      }
    });
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
