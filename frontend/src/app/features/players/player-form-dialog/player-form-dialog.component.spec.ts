import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PlayerFormDialogComponent } from './player-form-dialog.component';
import { Player } from '../../../core/services/players.service';

const PLAYER: Player = {
  id: 'p1',
  firstName: 'Leo',
  lastName: 'Messi',
  jerseyNumber: 10,
  position: 'Delantero',
  secondaryPosition: 'Extremo derecho',
  birthDate: null,
  active: true,
};

describe('PlayerFormDialogComponent', () => {
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<PlayerFormDialogComponent>>;

  function setup(player: Player | null) {
    dialogRefSpy = jasmine.createSpyObj<MatDialogRef<PlayerFormDialogComponent>>('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [PlayerFormDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: { player } },
        provideNoopAnimations(),
      ],
    });

    const fixture = TestBed.createComponent(PlayerFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('starts with an empty form in create mode', () => {
    const fixture = setup(null);
    const component = fixture.componentInstance;
    expect(component.isEdit).toBe(false);
    expect(component.form.controls.firstName.value).toBe('');
  });

  it('pre-fills the form from the given player in edit mode', () => {
    const fixture = setup(PLAYER);
    const component = fixture.componentInstance;
    expect(component.isEdit).toBe(true);
    expect(component.form.controls.firstName.value).toBe('Leo');
    expect(component.form.controls.jerseyNumber.value).toBe(10);
  });

  it('does not close the dialog and marks fields touched when the form is invalid', () => {
    const fixture = setup(null);
    fixture.componentInstance.submit();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.controls.firstName.touched).toBe(true);
  });

  it('closes the dialog with the assembled PlayerInput on a valid submit', () => {
    const fixture = setup(null);
    const component = fixture.componentInstance;
    component.form.setValue({
      firstName: 'Kylian',
      lastName: 'Mbappé',
      jerseyNumber: 7,
      position: '',
      secondaryPosition: '',
    });

    component.submit();

    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      firstName: 'Kylian',
      lastName: 'Mbappé',
      jerseyNumber: 7,
      position: null,
      secondaryPosition: null,
    });
  });

  it('cancel() closes the dialog with no result', () => {
    const fixture = setup(null);
    fixture.componentInstance.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith();
  });

  it('changing the primary position clears a matching secondary position, and excludes it from the options', () => {
    const fixture = setup(null);
    const component = fixture.componentInstance;
    component.form.controls.secondaryPosition.setValue('Portero');

    component.onPrimaryPositionChange('Portero');

    expect(component.form.controls.secondaryPosition.value).toBe('');
    expect(component.secondaryPositionOptions()).not.toContain('Portero');
  });
});
