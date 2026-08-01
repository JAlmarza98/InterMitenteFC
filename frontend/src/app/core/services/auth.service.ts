import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';

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

  /** Never throws: a 401 (not logged in) resolves to `{ user: null }` rather than an error. */
  fetchMe(): Observable<{ user: CurrentUser | null }> {
    return this.http.get<{ user: CurrentUser }>('/api/auth/me').pipe(
      tap((res) => this._user.set(res.user)),
      catchError(() => {
        this._user.set(null);
        return of({ user: null });
      }),
      tap(() => this._initialized.set(true))
    );
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
}
