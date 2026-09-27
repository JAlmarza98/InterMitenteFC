import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MatchStatsComponent } from './match-stats.component';
import { AuthService } from '../../../core/services/auth.service';
import { Player, PlayersService } from '../../../core/services/players.service';
import { MatchPlayerStatRow, StatsService } from '../../../core/services/stats.service';
import { MatchClockService } from '../../../core/services/match-clock.service';

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: `First-${id}`,
    lastName: `Last-${id}`,
    jerseyNumber: null,
    position: null,
    secondaryPosition: null,
    birthDate: null,
    active: true,
    ...overrides,
  };
}

function statRow(p: Player, overrides: Partial<MatchPlayerStatRow> = {}): MatchPlayerStatRow {
  return {
    playerId: p.id,
    player: p,
    isStarter: true,
    inSquad: true,
    secondsPlayed: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltyGoals: 0,
    penaltiesWon: 0,
    rating: null,
    ...overrides,
  };
}

describe('MatchStatsComponent', () => {
  const called = player('called');
  const outsider = player('outsider');
  const retired = player('retired', { active: false });

  let statsSpy: jasmine.SpyObj<StatsService>;
  let playersSpy: jasmine.SpyObj<PlayersService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  function setup(rows: MatchPlayerStatRow[] = [statRow(called)]) {
    statsSpy = jasmine.createSpyObj<StatsService>('StatsService', ['getMatchStats', 'upsertPlayerStat']);
    statsSpy.getMatchStats.and.returnValue(of({ players: rows }));
    playersSpy = jasmine.createSpyObj<PlayersService>('PlayersService', ['list']);
    playersSpy.list.and.returnValue(of({ players: [called, outsider, retired] }));
    const clockSpy = jasmine.createSpyObj<MatchClockService>('MatchClockService', ['listSegments']);
    clockSpy.listSegments.and.returnValue(of({ segments: [] }));
    snackBarSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      imports: [MatchStatsComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'm1' }) } } },
        { provide: StatsService, useValue: statsSpy },
        { provide: PlayersService, useValue: playersSpy },
        { provide: MatchClockService, useValue: clockSpy },
        { provide: AuthService, useValue: { isAdmin: () => true } },
      ],
    });
    TestBed.overrideProvider(MatSnackBar, { useValue: snackBarSpy });

    const fixture = TestBed.createComponent(MatchStatsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('offers every roster player not already listed, inactive ones included', () => {
    const component = setup().componentInstance;

    expect(playersSpy.list).toHaveBeenCalledWith(true);
    expect(component.addablePlayers().map((p) => p.id)).toEqual(['outsider', 'retired']);
  });

  it('addPlayer() adds a blank, not-called-up row the admin can then edit', () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.addPlayer(outsider);
    fixture.detectChanges();

    const added = component.rows().find((row) => row.playerId === 'outsider');
    expect(added).toEqual(jasmine.objectContaining({ inSquad: false, goals: 0, penaltyGoals: 0, penaltiesWon: 0 }));
    expect(component.addablePlayers().map((p) => p.id)).toEqual(['retired']);
    expect(fixture.nativeElement.textContent).toContain('No convocado');
  });

  it('does not duplicate an added player once the API starts returning them', () => {
    const component = setup().componentInstance;
    component.addPlayer(outsider);

    statsSpy.upsertPlayerStat.and.returnValue(of({ stat: {} }));
    statsSpy.getMatchStats.and.returnValue(
      of({ players: [statRow(called), statRow(outsider, { inSquad: false, isStarter: false, goals: 1 })] })
    );
    component.updateStat(component.rows()[1], 'goals', '1');

    expect(statsSpy.upsertPlayerStat).toHaveBeenCalledWith('m1', 'outsider', { goals: 1 });
    expect(component.rows().map((row) => row.playerId)).toEqual(['called', 'outsider']);
    expect(component.rows()[1].goals).toBe(1);
  });

  it('shows the server error and reloads when a correction is rejected', () => {
    const component = setup().componentInstance;
    statsSpy.upsertPlayerStat.and.returnValue(
      throwError(() => ({ error: { error: 'Los goles de penalti no pueden superar a los goles totales del jugador' } }))
    );

    component.updateStat(component.rows()[0], 'penaltyGoals', '1');

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Los goles de penalti no pueden superar a los goles totales del jugador',
      'Cerrar',
      jasmine.any(Object)
    );
    expect(statsSpy.getMatchStats).toHaveBeenCalledTimes(2); // initial load + revert
  });
});
