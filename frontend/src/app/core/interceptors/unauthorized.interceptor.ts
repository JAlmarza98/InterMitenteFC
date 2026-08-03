import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const EXEMPT_PATHS = ['/api/auth/me', '/api/auth/login', '/api/auth/register'];

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((err) => {
      const isExempt = EXEMPT_PATHS.some((path) => req.url.includes(path));
      if (err.status === 401 && !isExempt) {
        // The cached user signal is now known-stale (server says no session) —
        // drop it so the toolbar stops showing a logged-in user and guards
        // re-verify with the backend on the next navigation instead of
        // trusting the stale signal and bouncing back here in a loop.
        auth.clearSession();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
