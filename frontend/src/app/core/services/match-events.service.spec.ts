import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatchEventsService } from './match-events.service';

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
