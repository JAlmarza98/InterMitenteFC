import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const EXEMPT_PATHS = ['/api/auth/me', '/api/auth/login', '/api/auth/register'];

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err) => {
      const isExempt = EXEMPT_PATHS.some((path) => req.url.includes(path));
      if (err.status === 401 && !isExempt) {
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
