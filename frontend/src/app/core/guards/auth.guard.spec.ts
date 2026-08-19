import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService, CurrentUser } from '../services/auth.service';

function runGuard() {
  return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
}

function approvedUser(): CurrentUser {
  return { id: '1', email: 'a@b.com', name: 'A', role: 'member', status: 'approved' };
}

function pendingUser(): CurrentUser {
  return { id: '1', email: 'a@b.com', name: 'A', role: 'member', status: 'pending' };
}

describe('authGuard', () => {
  let fakeAuth: { user: () => CurrentUser | null; fetchMe: jasmine.Spy };
  let router: Router;
  let loginUrlTree: UrlTree;
  let pendingUrlTree: UrlTree;

  beforeEach(() => {
    fakeAuth = { user: () => null, fetchMe: jasmine.createSpy('fetchMe') };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth }],
    });

    router = TestBed.inject(Router);
    loginUrlTree = router.createUrlTree(['/login']);
    pendingUrlTree = router.createUrlTree(['/pending-approval']);
    spyOn(router, 'parseUrl').and.callFake((url: string) =>
      url === '/login' ? loginUrlTree : pendingUrlTree
    );
  });

  it('allows navigation when a cached approved user is already present', () => {
    fakeAuth.user = () => approvedUser();

    const result = runGuard();

    expect(result).toBe(true);
    expect(fakeAuth.fetchMe).not.toHaveBeenCalled();
  });

  it('redirects to /login when there is no session', (done) => {
    // Mirrors the real AuthService: fetchMe() also updates the `user`
    // signal as a side effect, which is what evaluate() reads afterwards.
    fakeAuth.fetchMe.and.callFake(() => {
      fakeAuth.user = () => null;
      return of({ user: null });
    });

    const result$ = runGuard() as Observable<unknown>;
    result$.subscribe((result) => {
      expect(result).toBe(loginUrlTree);
      done();
    });
  });

  it('redirects to /pending-approval when the account is not approved yet', (done) => {
    fakeAuth.fetchMe.and.callFake(() => {
      fakeAuth.user = () => pendingUser();
      return of({ user: pendingUser() });
    });

    const result$ = runGuard() as Observable<unknown>;
    result$.subscribe((result) => {
      expect(result).toBe(pendingUrlTree);
      done();
    });
  });
});
