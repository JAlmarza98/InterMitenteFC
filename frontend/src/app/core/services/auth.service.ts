import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';

export type UserRole = 'admin' | 'coach' | 'member';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<CurrentUser | null>(null);
  private readonly _initialized = signal(false);

  readonly user = this._user.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly isApproved = computed(() => this._user()?.status === 'approved');
  readonly isPending = computed(() => this._user()?.status === 'pending');
  readonly role = computed(() => this._user()?.role ?? null);
  /** Single source of truth for "can manage players/matches/live tracking" — admin and coach only. */
  readonly canManage = computed(() => {
    const role = this._user()?.role;
    return role === 'admin' || role === 'coach';
  });

  private fetchMe$: Observable<{ user: CurrentUser | null }> | null = null;

  /**
   * Never throws: a 401 (not logged in) resolves to `{ user: null }` rather
   * than an error. `authGuard` and `roleGuard` both call this independently
   * (Angular runs a route's guards in parallel, so neither can assume the
   * other already resolved it), and `AppComponent` calls it again on top of
   * that — on a fresh hard load that's up to 3 concurrent calls. The
   * in-flight observable is cached and shared so they collapse into a
   * single `/api/auth/me` request instead of 3.
   */
  fetchMe(): Observable<{ user: CurrentUser | null }> {
    if (this.fetchMe$) return this.fetchMe$;

    this.fetchMe$ = this.http.get<{ user: CurrentUser }>('/api/auth/me').pipe(
      tap((res) => this._user.set(res.user)),
      catchError(() => {
        this._user.set(null);
        return of({ user: null });
      }),
      tap(() => this._initialized.set(true)),
      shareReplay(1),
      finalize(() => {
        this.fetchMe$ = null;
      })
    );

    return this.fetchMe$;
  }

  register(email: string, password: string, name: string) {
    return this.http.post<{ user: CurrentUser; message: string }>('/api/auth/register', {
      email,
      password,
      name,
    });
  }

  login(email: string, password: string) {
    return this.http
      .post<{ user: CurrentUser }>('/api/auth/login', { email, password })
      .pipe(tap((res) => this._user.set(res.user)));
  }

  logout() {
    return this.http.post('/api/auth/logout', {}).pipe(tap(() => this._user.set(null)));
  }

  /** Drops the cached user without a network call — used when a 401 from any
   * request proves the session is already gone server-side, so the stale
   * signal doesn't keep the toolbar/guards acting as if still logged in. */
  clearSession() {
    this._user.set(null);
  }
}
