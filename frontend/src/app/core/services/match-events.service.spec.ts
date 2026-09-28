import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatchEvent, MatchEventsService, periodEventDescription } from './match-events.service';

describe('MatchEventsService', () => {
  let service: MatchEventsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MatchEventsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() fetches match events', () => {
    service.list('m1').subscribe();
    const req = httpMock.expectOne({ url: '/api/matches/m1/events', method: 'GET' });
    expect(req.request.method).toBe('GET');
    req.flush({ events: [] });
  });

  it('log() posts the player and event type', () => {
    service.log('m1', 'p1', 'goal').subscribe();
    const req = httpMock.expectOne('/api/matches/m1/events');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ playerId: 'p1', type: 'goal' });
    req.flush({ stat: {}, event: {}, match: null });
  });

  it('logOpponentGoal() posts without a playerId', () => {
    service.logOpponentGoal('m1').subscribe();
    const req = httpMock.expectOne('/api/matches/m1/events');
    expect(req.request.body).toEqual({ type: 'opponent_goal' });
    req.flush({ match: { opponentScore: 1 }, event: {} });
  });
});

describe('periodEventDescription', () => {
  function event(type: MatchEvent['type'], periodType: MatchEvent['periodType']): MatchEvent {
    return { id: 'e1', matchId: 'm1', type, periodType, second: 0, player: null, relatedPlayer: null, createdAt: '' };
  }

  it('describes the start and end of each half and of extra time', () => {
    expect(periodEventDescription(event('period_start', 'first_half'))).toBe('Empieza la 1ª parte');
    expect(periodEventDescription(event('period_end', 'second_half'))).toBe('Termina la 2ª parte');
    expect(periodEventDescription(event('period_start', 'extra_first'))).toBe('Empieza la 1ª parte de la prórroga');
    expect(periodEventDescription(event('period_end', 'extra_second'))).toBe('Termina la 2ª parte de la prórroga');
  });

  it('returns null for any other event', () => {
    expect(periodEventDescription(event('goal', 'first_half'))).toBeNull();
  });
});
