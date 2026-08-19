import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatchFormDialogComponent, MatchFormDialogData } from './match-form-dialog.component';
import { Match } from '../../../core/services/matches.service';

const EXISTING_MATCH: Match = {
  id: 'm1',
  seasonId: 's1',
  opponent: 'CD Rivas',
  matchDate: '2026-09-01T18:00:00.000Z',
  homeAway: 'home',
  competition: 'Liga',
  teamScore: null,
  opponentScore: null,
  notes: 'Llevar petos',
  status: 'scheduled',
  periodLengthMinutes: 25,
};

describe('MatchFormDialogComponent', () => {
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<MatchFormDialogComponent>>;

  function setup(data: MatchFormDialogData) {
    dialogRefSpy = jasmine.createSpyObj<MatDialogRef<MatchFormDialogComponent>>('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [MatchFormDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
        provideNativeDateAdapter(),
        provideNoopAnimations(),
      ],
    });

    const fixture = TestBed.createComponent(MatchFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('defaults periodLengthMinutes to 30 and homeAway to home in create mode', () => {
    const fixture = setup({ match: null, seasons: [] });
    const component = fixture.componentInstance;
    expect(component.isEdit).toBe(false);
    expect(component.form.controls.periodLengthMinutes.value).toBe(30);
    expect(component.form.controls.homeAway.value).toBe('home');
  });

  it('pre-fills the form from the given match in edit mode', () => {
    const fixture = setup({ match: EXISTING_MATCH, seasons: [] });
    const component = fixture.componentInstance;
    expect(component.isEdit).toBe(true);
    expect(component.form.controls.opponent.value).toBe('CD Rivas');
    expect(component.form.controls.periodLengthMinutes.value).toBe(25);
    expect(component.form.controls.notes.value).toBe('Llevar petos');
  });

  it('does not close the dialog when required fields are missing', () => {
    const fixture = setup({ match: null, seasons: [] });
    fixture.componentInstance.submit();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('combines the date and time controls into a single ISO matchDate on submit', () => {
    const fixture = setup({ match: null, seasons: [] });
    const component = fixture.componentInstance;
    const date = new Date(2026, 8, 1); // Sept 1 2026, local midnight
    const time = new Date(2000, 0, 1, 18, 30); // only hours/minutes are used

    component.form.patchValue({ opponent: 'CD Rivas', matchDate: date, matchTime: time });
    component.submit();

    expect(dialogRefSpy.close).toHaveBeenCalledTimes(1);
    const result = dialogRefSpy.close.calls.mostRecent().args[0];
    const closedDate = new Date(result.matchDate);
    expect(closedDate.getFullYear()).toBe(2026);
    expect(closedDate.getMonth()).toBe(8);
    expect(closedDate.getDate()).toBe(1);
    expect(closedDate.getHours()).toBe(18);
    expect(closedDate.getMinutes()).toBe(30);
    expect(result.opponent).toBe('CD Rivas');
    expect(result.seasonId).toBeNull();
    expect(result.competition).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('cancel() closes the dialog with no result', () => {
    const fixture = setup({ match: null, seasons: [] });
    fixture.componentInstance.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith();
  });
});
