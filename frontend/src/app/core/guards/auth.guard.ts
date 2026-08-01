import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService, CurrentUser } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user();
  if (user) {
    return evaluate(user, router);
  }

  return auth.fetchMe().pipe(map(() => evaluate(auth.user(), router)));
};

function evaluate(user: CurrentUser | null, router: Router) {
  if (!user) {
    return router.parseUrl('/login');
  }
  if (user.status === 'pending' || user.status === 'rejected') {
    return router.parseUrl('/pending-approval');
  }
  return true;
}
