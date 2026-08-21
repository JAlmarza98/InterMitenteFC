import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [IconComponent],
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
