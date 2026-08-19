import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminUsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() omits the status param when not given', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/admin/users');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ users: [] });
  });

  it('list(status) filters by status', () => {
    service.list('pending').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/admin/users');
    expect(req.request.params.get('status')).toBe('pending');
    req.flush({ users: [] });
  });

  it('approve()/reject() PATCH the right endpoints with an empty body', () => {
    service.approve('u1').subscribe();
    const approveReq = httpMock.expectOne('/api/admin/users/u1/approve');
    expect(approveReq.request.method).toBe('PATCH');
    expect(approveReq.request.body).toEqual({});
    approveReq.flush({ user: {} });

    service.reject('u1').subscribe();
    const rejectReq = httpMock.expectOne('/api/admin/users/u1/reject');
    rejectReq.flush({ user: {} });
  });

  it('updateRole() PATCHes the new role', () => {
    service.updateRole('u1', 'coach').subscribe();
    const req = httpMock.expectOne('/api/admin/users/u1/role');
    expect(req.request.body).toEqual({ role: 'coach' });
    req.flush({ user: {} });
  });
});
