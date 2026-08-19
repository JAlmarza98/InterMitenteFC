import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsService, formatRating, ratingTier } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(StatsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getMatchStats() fetches per-player match stats', () => {
    service.getMatchStats('m1').subscribe();
    const req = httpMock.expectOne('/api/matches/m1/stats');
    expect(req.request.method).toBe('GET');
    req.flush({ players: [] });
  });

  it('upsertPlayerStat() PUTs the stat payload', () => {
    service.upsertPlayerStat('m1', 'p1', { goals: 1 }).subscribe();
    const req = httpMock.expectOne('/api/matches/m1/player-stats/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ goals: 1 });
    req.flush({ stat: {} });
  });

  it('getSeasonStats() fetches the season aggregate', () => {
    service.getSeasonStats('s1').subscribe();
    const req = httpMock.expectOne('/api/stats/season/s1');
    expect(req.request.method).toBe('GET');
    req.flush({ season: {}, matchesPlayed: 0, players: [] });
  });
});

describe('formatRating', () => {
  it('formats a rating to one decimal', () => {
    expect(formatRating(7)).toBe('7.0');
    expect(formatRating(6.75)).toBe('6.8');
  });

  it('shows an em dash for a player who did not play', () => {
    expect(formatRating(null)).toBe('—');
  });
});

describe('ratingTier', () => {
  it('buckets ratings around the 5.0 baseline', () => {
    expect(ratingTier(null)).toBe('none');
    expect(ratingTier(3)).toBe('poor');
    expect(ratingTier(5)).toBe('average');
    expect(ratingTier(7)).toBe('good');
    expect(ratingTier(9)).toBe('excellent');
  });

  it('treats the tier boundaries as inclusive of the higher tier', () => {
    expect(ratingTier(4.5)).toBe('average');
    expect(ratingTier(6.5)).toBe('good');
    expect(ratingTier(8)).toBe('excellent');
  });
});
