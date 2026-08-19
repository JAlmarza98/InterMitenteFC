import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MatchesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() without a season omits the seasonId param', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/matches');
    expect(req.request.params.has('seasonId')).toBe(false);
    req.flush({ matches: [] });
  });

  it('list(seasonId) sends it as a query param', () => {
    service.list('s1').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/matches');
    expect(req.request.params.get('seasonId')).toBe('s1');
    req.flush({ matches: [] });
  });

  it('get() fetches a single match with its squad', () => {
    service.get('m1').subscribe();
    const req = httpMock.expectOne('/api/matches/m1');
    expect(req.request.method).toBe('GET');
    req.flush({ match: {} });
  });

  it('create() posts the match payload', () => {
    const input = { opponent: 'CD Rivas', matchDate: '2026-09-01', homeAway: 'home' as const };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/matches');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ match: {} });
  });

  it('update() patches the given fields', () => {
    service.update('m1', { status: 'live' }).subscribe();
    const req = httpMock.expectOne('/api/matches/m1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'live' });
    req.flush({ match: {} });
  });

  it('delete() sends a DELETE request', () => {
    service.delete('m1').subscribe();
    const req = httpMock.expectOne('/api/matches/m1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('setSquad() PUTs the squad list', () => {
    const players = [{ playerId: 'p1', isStarter: true }];
    service.setSquad('m1', players).subscribe();
    const req = httpMock.expectOne('/api/matches/m1/squad');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ players });
    req.flush({ squad: [] });
  });
});
