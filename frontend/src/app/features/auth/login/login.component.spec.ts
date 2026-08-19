import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService, CurrentUser } from '../../../core/services/auth.service';

describe('LoginComponent', () => {
  let authSpy: jasmine.SpyObj<AuthService>;
  let router: Router;

  function setup() {
    authSpy = jasmine.createSpyObj<AuthService>('AuthService', ['login']);

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authSpy },
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');

    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('does not call the API when the form is invalid, and marks fields as touched', () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.submit();

    expect(authSpy.login).not.toHaveBeenCalled();
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('logs in and navigates home when the account is approved', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const user: CurrentUser = { id: '1', email: 'a@b.com', name: 'A', role: 'member', status: 'approved' };
    authSpy.login.and.returnValue(of({ user }));

    component.form.setValue({ email: 'a@b.com', password: 'secret123' });
    component.submit();

    expect(authSpy.login).toHaveBeenCalledWith('a@b.com', 'secret123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    expect(component.loading()).toBe(false);
  });

  it('navigates to pending-approval when the account is not yet approved', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const user: CurrentUser = { id: '1', email: 'a@b.com', name: 'A', role: 'member', status: 'pending' };
    authSpy.login.and.returnValue(of({ user }));

    component.form.setValue({ email: 'a@b.com', password: 'secret123' });
    component.submit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/pending-approval');
  });

  it('shows an error message and stops loading when login fails', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    authSpy.login.and.returnValue(throwError(() => new Error('bad credentials')));

    component.form.setValue({ email: 'a@b.com', password: 'wrong' });
    component.submit();

    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('Email o contraseña incorrectos.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
