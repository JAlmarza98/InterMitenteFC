import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MatchListComponent } from './match-list.component';
import { Match, MatchesService } from '../../../core/services/matches.service';
import { SeasonsService } from '../../../core/services/seasons.service';
import { AuthService } from '../../../core/services/auth.service';

const MATCH: Match = {
  id: 'm1',
  seasonId: null,
  opponent: 'CD Rivas',
  matchDate: '2026-09-01T18:00:00.000Z',
  homeAway: 'home',
  competition: null,
  teamScore: null,
  opponentScore: null,
  notes: null,
  status: 'scheduled',
  periodLengthMinutes: 30,
};

describe('MatchListComponent', () => {
  let matchesSpy: jasmine.SpyObj<MatchesService>;
  let seasonsSpy: jasmine.SpyObj<SeasonsService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let router: Router;

  function setup() {
    matchesSpy = jasmine.createSpyObj<MatchesService>('MatchesService', ['list', 'create', 'delete']);
    seasonsSpy = jasmine.createSpyObj<SeasonsService>('SeasonsService', ['list']);
    dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    snackBarSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    matchesSpy.list.and.returnValue(of({ matches: [MATCH] }));

    TestBed.configureTestingModule({
      imports: [MatchListComponent],
      providers: [
        { provide: MatchesService, useValue: matchesSpy },
        { provide: SeasonsService, useValue: seasonsSpy },
        { provide: AuthService, useValue: { canManage: () => true, isAdmin: () => true } },
        provideRouter([]),
        provideNoopAnimations(),
      ],
    });
    // MatDialog/MatSnackBar are re-provided by the MatDialogModule/MatSnackBarModule
    // that MatchListComponent itself imports, which shadows a plain `providers`
    // override above — TestBed.overrideProvider() is the API built to win that
    // fight (see the identical PlayerListComponent spec for the same pattern).
    TestBed.overrideProvider(MatDialog, { useValue: dialogSpy });
    TestBed.overrideProvider(MatSnackBar, { useValue: snackBarSpy });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    const fixture = TestBed.createComponent(MatchListComponent);
    fixture.detectChanges();
    return fixture;
  }

  function dialogReturning(result: unknown) {
    return { afterClosed: () => of(result) } as MatDialogRef<unknown>;
  }

  it('loads the match list on init', () => {
    setup();
    expect(matchesSpy.list).toHaveBeenCalled();
  });

  it('statusLabel() maps every status to its Spanish label', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    expect(component.statusLabel('scheduled')).toBe('Programado');
    expect(component.statusLabel('live')).toBe('En juego');
    expect(component.statusLabel('finished')).toBe('Finalizado');
  });

  it('openMatch() navigates to the match detail route', () => {
    const fixture = setup();
    fixture.componentInstance.openMatch(MATCH);
    expect(router.navigate).toHaveBeenCalledWith(['/matches', 'm1']);
  });

  it('deleteMatch() does nothing if the confirm dialog is dismissed', () => {
    const fixture = setup();
    spyOn(window, 'confirm').and.returnValue(false);

    fixture.componentInstance.deleteMatch(new Event('click'), MATCH);

    expect(matchesSpy.delete).not.toHaveBeenCalled();
  });

  it('deleteMatch() deletes and reloads when confirmed', () => {
    const fixture = setup();
    spyOn(window, 'confirm').and.returnValue(true);
    matchesSpy.delete.and.returnValue(of(undefined));

    fixture.componentInstance.deleteMatch(new Event('click'), MATCH);

    expect(matchesSpy.delete).toHaveBeenCalledWith('m1');
    expect(matchesSpy.list).toHaveBeenCalledTimes(2); // initial load + reload after delete
  });

  it('deleteMatch() shows the server error message when deletion fails', () => {
    const fixture = setup();
    spyOn(window, 'confirm').and.returnValue(true);
    matchesSpy.delete.and.returnValue(throwError(() => ({ error: { error: 'No se puede borrar' } })));

    fixture.componentInstance.deleteMatch(new Event('click'), MATCH);

    expect(snackBarSpy.open).toHaveBeenCalledWith('No se puede borrar', 'Cerrar', jasmine.any(Object));
  });

  it('openCreate() loads seasons, then creates the match and reloads on a result', () => {
    const fixture = setup();
    seasonsSpy.list.and.returnValue(of({ seasons: [] }));
    const input = { opponent: 'Nuevo Rival', matchDate: '2026-10-01T18:00:00.000Z', homeAway: 'away' as const };
    dialogSpy.open.and.returnValue(dialogReturning(input));
    matchesSpy.create.and.returnValue(of({ match: { ...MATCH, ...input, id: 'm2' } }));

    fixture.componentInstance.openCreate();

    expect(seasonsSpy.list).toHaveBeenCalled();
    expect(matchesSpy.create).toHaveBeenCalledWith(input);
    expect(snackBarSpy.open).toHaveBeenCalledWith('Partido creado', 'Cerrar', jasmine.any(Object));
    expect(matchesSpy.list).toHaveBeenCalledTimes(2); // initial load + reload after create
  });

  it('openCreate() does nothing if the dialog is dismissed without a result', () => {
    const fixture = setup();
    seasonsSpy.list.and.returnValue(of({ seasons: [] }));
    dialogSpy.open.and.returnValue(dialogReturning(undefined));

    fixture.componentInstance.openCreate();

    expect(matchesSpy.create).not.toHaveBeenCalled();
  });
});
