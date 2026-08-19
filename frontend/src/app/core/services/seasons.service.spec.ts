import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SeasonsService } from './seasons.service';

describe('SeasonsService', () => {
  let service: SeasonsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SeasonsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() fetches all seasons', () => {
    service.list().subscribe();
    const req = httpMock.expectOne('/api/seasons');
    expect(req.request.method).toBe('GET');
    req.flush({ seasons: [] });
  });

  it('create() posts the season payload', () => {
    const input = { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/seasons');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ season: {} });
  });

  it('update() patches the given fields', () => {
    service.update('s1', { isActive: true }).subscribe();
    const req = httpMock.expectOne('/api/seasons/s1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isActive: true });
    req.flush({ season: {} });
  });
});
