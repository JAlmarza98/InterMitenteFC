import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { PlayerListComponent } from './player-list.component';
import { Player, PlayersService } from '../../../core/services/players.service';
import { AuthService } from '../../../core/services/auth.service';

const PLAYER: Player = {
  id: 'p1',
  firstName: 'Leo',
  lastName: 'Messi',
  jerseyNumber: 10,
  position: null,
  secondaryPosition: null,
  birthDate: null,
  active: true,
};

describe('PlayerListComponent', () => {
  let playersSpy: jasmine.SpyObj<PlayersService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  function setup(canManage = true) {
    playersSpy = jasmine.createSpyObj<PlayersService>('PlayersService', ['list', 'create', 'update']);
    playersSpy.list.and.returnValue(of({ players: [PLAYER] }));
    dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    snackBarSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      imports: [PlayerListComponent],
      providers: [
        { provide: PlayersService, useValue: playersSpy },
        { provide: AuthService, useValue: { canManage: () => canManage } },
        provideNoopAnimations(),
      ],
    });
    // MatDialog/MatSnackBar are re-provided by the MatDialogModule/MatSnackBarModule
    // that PlayerListComponent itself imports, which shadows a plain `providers`
    // override above — TestBed.overrideProvider() is the API built to win that fight.
    TestBed.overrideProvider(MatDialog, { useValue: dialogSpy });
    TestBed.overrideProvider(MatSnackBar, { useValue: snackBarSpy });

    const fixture = TestBed.createComponent(PlayerListComponent);
    fixture.detectChanges();
    return fixture;
  }

  function dialogReturning(result: unknown) {
    return { afterClosed: () => of(result) } as MatDialogRef<unknown>;
  }

  it('loads the squad on init with includeInactive=false', () => {
    setup();
    expect(playersSpy.list).toHaveBeenCalledWith(false);
  });

  it('toggleShowInactive() flips the flag and reloads with includeInactive=true', () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.toggleShowInactive();

    expect(component.showInactive()).toBe(true);
    expect(playersSpy.list).toHaveBeenCalledWith(true);
  });

  it('toggleActive() flips the player and reloads the list', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    playersSpy.update.and.returnValue(of({ player: { ...PLAYER, active: false } }));

    component.toggleActive(PLAYER);

    expect(playersSpy.update).toHaveBeenCalledWith('p1', { active: false });
    expect(playersSpy.list).toHaveBeenCalledTimes(2); // initial load + reload after toggle
  });

  it('exposes canManage from AuthService', () => {
    const fixture = setup(false);
    expect(fixture.componentInstance.canManage()).toBe(false);
  });

  it('openCreate() does nothing if the dialog is dismissed without a result', () => {
    const fixture = setup();
    dialogSpy.open.and.returnValue(dialogReturning(undefined));

    fixture.componentInstance.openCreate();

    expect(playersSpy.create).not.toHaveBeenCalled();
  });

  it('openCreate() creates the player and reloads the list on a result', () => {
    const fixture = setup();
    const input = { firstName: 'New', lastName: 'Player', jerseyNumber: null, position: null, secondaryPosition: null };
    dialogSpy.open.and.returnValue(dialogReturning(input));
    playersSpy.create.and.returnValue(of({ player: { ...PLAYER, ...input, id: 'p2' } }));

    fixture.componentInstance.openCreate();

    expect(playersSpy.create).toHaveBeenCalledWith(input);
    expect(snackBarSpy.open).toHaveBeenCalledWith('Jugador creado', 'Cerrar', jasmine.any(Object));
    expect(playersSpy.list).toHaveBeenCalledTimes(2); // initial load + reload after create
  });

  it('openCreate() shows the server error message when creation fails', () => {
    const fixture = setup();
    dialogSpy.open.and.returnValue(
      dialogReturning({
        firstName: 'New',
        lastName: 'Player',
        jerseyNumber: null,
        position: null,
        secondaryPosition: null,
      })
    );
    playersSpy.create.and.returnValue(throwError(() => ({ error: { error: 'Dorsal duplicado' } })));

    fixture.componentInstance.openCreate();

    expect(snackBarSpy.open).toHaveBeenCalledWith('Dorsal duplicado', 'Cerrar', jasmine.any(Object));
  });

  it('openEdit() updates the player and reloads the list on a result', () => {
    const fixture = setup();
    const input = { firstName: 'Leo', lastName: 'Messi', jerseyNumber: 30, position: null, secondaryPosition: null };
    dialogSpy.open.and.returnValue(dialogReturning(input));
    playersSpy.update.and.returnValue(of({ player: { ...PLAYER, ...input } }));

    fixture.componentInstance.openEdit(PLAYER);

    expect(playersSpy.update).toHaveBeenCalledWith('p1', input);
    expect(snackBarSpy.open).toHaveBeenCalledWith('Jugador actualizado', 'Cerrar', jasmine.any(Object));
  });
});
