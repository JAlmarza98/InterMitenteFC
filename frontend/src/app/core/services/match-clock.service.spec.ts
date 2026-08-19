import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  MatchClockService,
  ClockPeriod,
  elapsedSecondsInPeriod,
  periodOffsetSeconds,
  formatMinuteSeconds,
} from './match-clock.service';

describe('MatchClockService', () => {
  let service: MatchClockService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MatchClockService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getClock() fetches the current clock state', () => {
    service.getClock('m1').subscribe();
    const req = httpMock.expectOne({ url: '/api/matches/m1/clock', method: 'GET' });
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('startPeriod() posts the period type', () => {
    service.startPeriod('m1', 'first_half').subscribe();
    const req = httpMock.expectOne('/api/matches/m1/clock/start-period');
    expect(req.request.body).toEqual({ type: 'first_half' });
    req.flush({});
  });

  it('pause()/resume()/endPeriod()/finish() post with an empty body', () => {
    service.pause('m1').subscribe();
    const pauseReq = httpMock.expectOne('/api/matches/m1/clock/pause');
    expect(pauseReq.request.body).toEqual({});
    pauseReq.flush({});

    service.resume('m1').subscribe();
    const resumeReq = httpMock.expectOne('/api/matches/m1/clock/resume');
    expect(resumeReq.request.body).toEqual({});
    resumeReq.flush({});

    service.endPeriod('m1').subscribe();
    const endReq = httpMock.expectOne('/api/matches/m1/clock/end-period');
    expect(endReq.request.body).toEqual({});
    endReq.flush({});

    service.finish('m1').subscribe();
    const finishReq = httpMock.expectOne('/api/matches/m1/clock/finish');
    expect(finishReq.request.body).toEqual({});
    finishReq.flush({});
  });

  it('substitute() posts the in/out player ids', () => {
    service.substitute('m1', 'out1', 'in1').subscribe();
    const req = httpMock.expectOne('/api/matches/m1/substitutions');
    expect(req.request.body).toEqual({ playerOutId: 'out1', playerInId: 'in1' });
    req.flush({});
  });

  it('createSegment()/updateSegment()/deleteSegment() hit the right endpoints', () => {
    service
      .createSegment('m1', { playerId: 'p1', periodType: 'first_half', startSecond: 0, endSecond: null })
      .subscribe();
    const createReq = httpMock.expectOne((r) => r.url === '/api/matches/m1/segments' && r.method === 'POST');
    expect(createReq.request.body.playerId).toBe('p1');
    createReq.flush({});

    service.updateSegment('m1', 'seg1', { endSecond: 120 }).subscribe();
    const updateReq = httpMock.expectOne((r) => r.url === '/api/matches/m1/segments/seg1' && r.method === 'PATCH');
    expect(updateReq.request.body).toEqual({ endSecond: 120 });
    updateReq.flush({});

    service.deleteSegment('m1', 'seg1').subscribe();
    const deleteReq = httpMock.expectOne((r) => r.url === '/api/matches/m1/segments/seg1' && r.method === 'DELETE');
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush(null);
  });
});

const T0 = new Date('2026-08-19T10:00:00.000Z');
const secondsLater = (s: number) => new Date(T0.getTime() + s * 1000);

function period(overrides: Partial<ClockPeriod> = {}): ClockPeriod {
  return { type: 'first_half', startedAt: null, endedAt: null, pauses: [], ...overrides };
}

describe('elapsedSecondsInPeriod', () => {
  it('is 0 before the period starts', () => {
    expect(elapsedSecondsInPeriod(period(), secondsLater(50))).toBe(0);
  });

  it('counts elapsed time, subtracting completed pauses', () => {
    const p = period({
      startedAt: T0.toISOString(),
      pauses: [{ pausedAt: secondsLater(10).toISOString(), resumedAt: secondsLater(20).toISOString() }],
    });
    expect(elapsedSecondsInPeriod(p, secondsLater(100))).toBe(90);
  });

  it('freezes at endedAt once the period is closed', () => {
    const p = period({ startedAt: T0.toISOString(), endedAt: secondsLater(300).toISOString() });
    expect(elapsedSecondsInPeriod(p, secondsLater(9999))).toBe(300);
  });
});

describe('periodOffsetSeconds', () => {
  it('sums the elapsed time of every prior period', () => {
    const periods: ClockPeriod[] = [
      period({ type: 'first_half', startedAt: T0.toISOString(), endedAt: secondsLater(1800).toISOString() }),
    ];
    expect(periodOffsetSeconds(periods, 'second_half', secondsLater(9999))).toBe(1800);
  });

  it('is 0 for the very first period', () => {
    expect(periodOffsetSeconds([], 'first_half', secondsLater(100))).toBe(0);
  });
});

describe('formatMinuteSeconds', () => {
  it('formats seconds as m:ss', () => {
    expect(formatMinuteSeconds(65)).toBe('1:05');
    expect(formatMinuteSeconds(0)).toBe('0:00');
    expect(formatMinuteSeconds(3661)).toBe('61:01');
  });
});
