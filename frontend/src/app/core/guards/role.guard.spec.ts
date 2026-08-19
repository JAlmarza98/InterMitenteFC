import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { roleGuard } from './role.guard';
import { AuthService, UserRole } from '../services/auth.service';

function runGuard(...roles: UserRole[]) {
  const guard = roleGuard(...roles);
  return TestBed.runInInjectionContext(() => guard({} as any, {} as any));
}

describe('roleGuard', () => {
  let fakeAuth: { role: () => UserRole | null; initialized: () => boolean; fetchMe: jasmine.Spy };
  let router: Router;
  let homeUrlTree: UrlTree;

  beforeEach(() => {
    fakeAuth = { role: () => null, initialized: () => true, fetchMe: jasmine.createSpy('fetchMe') };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth }],
    });

    router = TestBed.inject(Router);
    homeUrlTree = router.createUrlTree(['/']);
    spyOn(router, 'parseUrl').and.returnValue(homeUrlTree);
  });

  it('allows navigation when the current role is already known and matches', () => {
    fakeAuth.role = () => 'admin';

    const result = runGuard('admin', 'coach');

    expect(result).toBe(true);
    expect(fakeAuth.fetchMe).not.toHaveBeenCalled();
  });

  it('redirects home when the current role is known but not allowed', () => {
    fakeAuth.role = () => 'member';

    const result = runGuard('admin');

    expect(result).toBe(homeUrlTree);
  });

  it('waits for fetchMe() when auth has not initialized yet, then evaluates the resolved role', (done) => {
    fakeAuth.initialized = () => false;
    fakeAuth.fetchMe.and.callFake(() => {
      fakeAuth.role = () => 'admin';
      return of({ user: null });
    });

    const result$ = runGuard('admin') as Observable<unknown>;
    result$.subscribe((result) => {
      expect(result).toBe(true);
      done();
    });
  });
});
