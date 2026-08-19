import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, CurrentUser } from './auth.service';

const APPROVED_USER: CurrentUser = {
  id: '1',
  email: 'coach@example.com',
  name: 'Coach',
  role: 'coach',
  status: 'approved',
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetchMe() sets the user signal and marks initialized on success', () => {
    let result: { user: CurrentUser | null } | undefined;
    service.fetchMe().subscribe((res) => (result = res));

    httpMock.expectOne('/api/auth/me').flush({ user: APPROVED_USER });

    expect(result?.user).toEqual(APPROVED_USER);
    expect(service.user()).toEqual(APPROVED_USER);
    expect(service.initialized()).toBe(true);
  });

  it('fetchMe() resolves to a null user instead of throwing on a 401', () => {
    let result: { user: CurrentUser | null } | undefined;
    service.fetchMe().subscribe((res) => (result = res));

    httpMock.expectOne('/api/auth/me').flush({ error: 'Not authenticated' }, { status: 401, statusText: 'Unauthorized' });

    expect(result?.user).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.initialized()).toBe(true);
  });

  it('fetchMe() dedupes concurrent calls into a single request', () => {
    service.fetchMe().subscribe();
    service.fetchMe().subscribe();

    const req = httpMock.expectOne('/api/auth/me');
    expect(req.request.method).toBe('GET');
    req.flush({ user: APPROVED_USER });
  });

  it('login() posts credentials and updates the user signal', () => {
    service.login('coach@example.com', 'secret123').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'coach@example.com', password: 'secret123' });
    req.flush({ user: APPROVED_USER });

    expect(service.user()).toEqual(APPROVED_USER);
  });

  it('logout() clears the user signal', () => {
    service.login('coach@example.com', 'secret123').subscribe();
    httpMock.expectOne('/api/auth/login').flush({ user: APPROVED_USER });
    expect(service.user()).toEqual(APPROVED_USER);

    service.logout().subscribe();
    httpMock.expectOne('/api/auth/logout').flush({});
    expect(service.user()).toBeNull();
  });

  it('derives isApproved/isAdmin/canManage from the current user', () => {
    service.login('coach@example.com', 'secret123').subscribe();
    httpMock.expectOne('/api/auth/login').flush({ user: APPROVED_USER });

    expect(service.isApproved()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(service.canManage()).toBe(true);

    service.login('admin@example.com', 'secret123').subscribe();
    httpMock.expectOne('/api/auth/login').flush({ user: { ...APPROVED_USER, role: 'admin' } });

    expect(service.isAdmin()).toBe(true);
  });
});
