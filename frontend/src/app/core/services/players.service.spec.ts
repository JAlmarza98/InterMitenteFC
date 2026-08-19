import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlayersService } from './players.service';

describe('PlayersService', () => {
  let service: PlayersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PlayersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() omits includeInactive by default', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/players');
    expect(req.request.params.has('includeInactive')).toBe(false);
    req.flush({ players: [] });
  });

  it('list(true) sends includeInactive=true', () => {
    service.list(true).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/players');
    expect(req.request.params.get('includeInactive')).toBe('true');
    req.flush({ players: [] });
  });

  it('create() posts the player payload', () => {
    const input = { firstName: 'Leo', lastName: 'Messi', jerseyNumber: 10, position: null, secondaryPosition: null };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/players');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ player: { ...input, id: '1', birthDate: null, active: true } });
  });

  it('update() patches the given fields', () => {
    service.update('1', { active: false }).subscribe();
    const req = httpMock.expectOne('/api/players/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    req.flush({ player: {} });
  });
});
