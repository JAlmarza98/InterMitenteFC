import { Component, inject, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './core/services/auth.service';
import { LiveUpdatesService } from './core/services/live-updates.service';
import { IconComponent } from './shared/icon/icon.component';

// The auth screens (login/register/pending-approval) are full-screen,
// self-contained mockups with no nav of their own — the app shell's
// toolbar above them doesn't match the design and eats into the vertical
// space they need to fit without scrolling on mobile.
const AUTH_ROUTES = new Set(['/login', '/register', '/pending-approval']);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatMenuModule,
    IconComponent,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly liveUpdates = inject(LiveUpdatesService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  readonly isAuthRoute = computed(() => AUTH_ROUTES.has(this.currentUrl().split('?')[0].split('#')[0]));

  constructor() {
    this.auth.fetchMe().subscribe();

    // One connection for the whole app, open exactly while someone's
    // logged in — every screen showing live match state subscribes to
    // LiveUpdatesService.updates$ rather than opening its own connection.
    effect(() => {
      if (this.auth.isApproved()) {
        this.liveUpdates.connect();
      } else {
        this.liveUpdates.disconnect();
      }
    });
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
