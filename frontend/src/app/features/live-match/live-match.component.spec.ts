import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, Subject } from 'rxjs';
import { LiveMatchComponent } from './live-match.component';
import { AuthService } from '../../core/services/auth.service';
import { LiveUpdatesService, MatchUpdate } from '../../core/services/live-updates.service';
import { MatchesService, MatchWithSquad } from '../../core/services/matches.service';
import { MatchClockService, Segment } from '../../core/services/match-clock.service';
import { MatchPlayerStatRow, StatsService } from '../../core/services/stats.service';
import { MatchEvent, MatchEventsService } from '../../core/services/match-events.service';
import { Player } from '../../core/services/players.service';

function player(id: string, firstName: string): Player {
  return {
    id,
    firstName,
    lastName: 'Test',
    jerseyNumber: null,
    position: null,
    secondaryPosition: null,
    birthDate: null,
    active: true,
  };
}

const STARTER = player('starter', 'Titular');
const SUB = player('sub', 'Suplente');
const SENT_OFF = player('sent-off', 'Expulsado');

const MATCH: MatchWithSquad = {
  id: 'm1',
  seasonId: null,
  opponent: 'CD Rivas',
  matchDate: '2026-09-01T18:00:00.000Z',
  homeAway: 'home',
  competition: null,
  teamScore: 0,
  opponentScore: 0,
  notes: null,
  status: 'live',
  periodLengthMinutes: 30,
  squad: [STARTER, SUB, SENT_OFF].map((p, i) => ({
    id: `sq${i}`,
    matchId: 'm1',
    playerId: p.id,
    isStarter: p === STARTER,
    player: p,
  })),
};

const OPEN_SEGMENT: Segment = {
  id: 'seg1',
  matchId: 'm1',
  playerId: STARTER.id,
  periodType: 'first_half',
  startSecond: 0,
  endSecond: null,
  startedAt: null,
  endedAt: null,
  source: 'live',
  player: STARTER,
};

function event(type: MatchEvent['type'], p: Player): MatchEvent {
  return {
    id: `${type}-${p.id}`,
    matchId: 'm1',
    type,
    periodType: 'first_half',
    second: 60,
    player: p,
    relatedPlayer: null,
    createdAt: '',
  };
}

describe('LiveMatchComponent', () => {
  let eventsSpy: jasmine.SpyObj<MatchEventsService>;

  function setup() {
    const matchesSpy = jasmine.createSpyObj<MatchesService>('MatchesService', ['get']);
    matchesSpy.get.and.returnValue(of({ match: MATCH }));
    const clockSpy = jasmine.createSpyObj<MatchClockService>('MatchClockService', ['getClock', 'listSegments']);
    clockSpy.getClock.and.returnValue(
      of({
        serverNow: new Date().toISOString(),
        periodLengthMinutes: 30,
        periods: [],
        activePeriodType: null,
        isPaused: false,
        currentSecond: null,
      })
    );
    clockSpy.listSegments.and.returnValue(of({ segments: [OPEN_SEGMENT] }));
    const statsSpy = jasmine.createSpyObj<StatsService>('StatsService', ['getMatchStats']);
    statsSpy.getMatchStats.and.returnValue(of({ players: [] as MatchPlayerStatRow[] }));
    eventsSpy = jasmine.createSpyObj<MatchEventsService>('MatchEventsService', ['list', 'log']);
    eventsSpy.list.and.returnValue(of({ events: [event('red_card', SENT_OFF)] }));

    TestBed.configureTestingModule({
      imports: [LiveMatchComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'm1' }) } } },
        { provide: MatchesService, useValue: matchesSpy },
        { provide: MatchClockService, useValue: clockSpy },
        { provide: StatsService, useValue: statsSpy },
        { provide: MatchEventsService, useValue: eventsSpy },
        { provide: LiveUpdatesService, useValue: { updates$: new Subject<MatchUpdate>() } },
        { provide: AuthService, useValue: { canManage: () => true } },
      ],
    });
    TestBed.overrideProvider(MatSnackBar, { useValue: jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']) });

    const fixture = TestBed.createComponent(LiveMatchComponent);
    fixture.detectChanges();
    fixture.componentInstance.setRosterTab('bench');
    fixture.detectChanges();
    return fixture;
  }

  function button(fixture: ReturnType<typeof setup>, label: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[aria-label="${label}"]`);
  }

  it('lets a bench player be shown a yellow or red card', () => {
    const fixture = setup();
    eventsSpy.log.and.returnValue(of({ stat: {}, event: event('yellow_card', SUB), match: null }));

    button(fixture, 'Añadir tarjeta amarilla a Suplente Test')!.click();

    expect(eventsSpy.log).toHaveBeenCalledWith('m1', 'sub', 'yellow_card');
    expect(button(fixture, 'Añadir tarjeta roja a Suplente Test')).not.toBeNull();
  });

  it('offers no booking buttons for a bench player already sent off', () => {
    const fixture = setup();

    expect(button(fixture, 'Añadir tarjeta amarilla a Expulsado Test')).toBeNull();
    expect(button(fixture, 'Añadir tarjeta roja a Expulsado Test')).toBeNull();
  });

  it('counts a penalty goal as a goal too while the request is in flight', () => {
    const fixture = setup();
    fixture.componentInstance.setRosterTab('pitch');
    fixture.detectChanges();
    const pending = new Subject<never>();
    eventsSpy.log.and.returnValue(pending);

    button(fixture, 'Añadir gol de penalti')!.click();
    fixture.detectChanges();

    expect(eventsSpy.log).toHaveBeenCalledWith('m1', 'starter', 'penalty_goal');
    const stats = fixture.componentInstance.statsByPlayer().get('starter')!;
    expect(stats.goals).toBe(1);
    expect(stats.penaltyGoals).toBe(1);
  });
});
