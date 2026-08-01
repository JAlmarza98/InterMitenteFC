import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService, UserRole } from '../services/auth.service';

export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const evaluate = () => {
      const role = auth.role();
      return role && roles.includes(role) ? true : router.parseUrl('/');
    };

    // Angular evaluates every guard in a route's canActivate array in
    // parallel, not in sequence — so this can't just trust that authGuard's
    // async session fetch (also listed on these routes) has already
    // populated the user signal by the time this runs. On a hard page load
    // that race was losing every time, bouncing admin/coach routes home
    // before /api/auth/me had even resolved.
    if (auth.initialized()) {
      return evaluate();
    }
    return auth.fetchMe().pipe(map(() => evaluate()));
  };
}
