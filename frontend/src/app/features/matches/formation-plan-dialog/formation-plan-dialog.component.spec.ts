import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FormationPlanDialogComponent, FormationPlanDialogData } from './formation-plan-dialog.component';
import { MatchFormation, MatchWithSquad } from '../../../core/services/matches.service';
import { Player } from '../../../core/services/players.service';

function makePlayer(id: string, jerseyNumber: number): Player {
  return {
    id,
    firstName: `F${id}`,
    lastName: `L${id}`,
    jerseyNumber,
    position: null,
    secondaryPosition: null,
    birthDate: null,
    active: true,
  };
}

const STARTERS: Player[] = Array.from({ length: 7 }, (_, i) => makePlayer(`s${i}`, i + 1));
const BENCH: Player[] = [makePlayer('b0', 20)];

const MATCH: MatchWithSquad = {
  id: 'm1',
  seasonId: null,
  opponent: 'CD Rivas',
  matchDate: '2026-03-01T18:00:00.000Z',
  homeAway: 'home',
  competition: 'Liga',
  teamScore: null,
  opponentScore: null,
  notes: null,
  status: 'scheduled',
  periodLengthMinutes: 30,
  squad: [
    ...STARTERS.map((p) => ({ id: `squad-${p.id}`, matchId: 'm1', playerId: p.id, isStarter: true, player: p })),
    ...BENCH.map((p) => ({ id: `squad-${p.id}`, matchId: 'm1', playerId: p.id, isStarter: false, player: p })),
  ],
};

describe('FormationPlanDialogComponent', () => {
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<FormationPlanDialogComponent>>;
  let httpMock: HttpTestingController;

  function setup(data: FormationPlanDialogData) {
    dialogRefSpy = jasmine.createSpyObj<MatDialogRef<FormationPlanDialogComponent>>('MatDialogRef', ['close']);

    TestBed.configureTestingModule({
      imports: [FormationPlanDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(FormationPlanDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('builds one control per slot (empty, subs default to []) when a preset is picked', () => {
    const fixture = setup({ matchId: 'm1', match: MATCH, starters: STARTERS, bench: BENCH, existingFormation: null });
    const component = fixture.componentInstance;

    const preset = component.presets.find((p) => p.id === '1-2-3-1')!;
    component.selectPreset(preset);

    const slotKeys = preset.slots.map((s) => s.key);
    expect(Object.keys(component.slotAssignmentForm.controls).sort()).toEqual([...slotKeys].sort());
    expect(Object.keys(component.slotSubsForm.controls).sort()).toEqual([...slotKeys].sort());
    for (const key of slotKeys) {
      expect(component.slotAssignmentForm.controls[key].value).toBe('');
      expect(component.slotSubsForm.controls[key].value).toEqual([]);
    }
  });

  it('is invalid until every slot has a distinct starter', () => {
    const fixture = setup({ matchId: 'm1', match: MATCH, starters: STARTERS, bench: BENCH, existingFormation: null });
    const component = fixture.componentInstance;
    const preset = component.presets.find((p) => p.id === '1-2-3-1')!;
    component.selectPreset(preset);

    expect(component.slotAssignmentForm.invalid).toBeTrue();

    preset.slots.forEach((slot, i) => component.slotAssignmentForm.controls[slot.key].setValue(STARTERS[i].id));
    expect(component.slotAssignmentForm.valid).toBeTrue();

    // Duplicate: the last slot reuses the first slot's starter.
    const lastKey = preset.slots[preset.slots.length - 1].key;
    component.slotAssignmentForm.controls[lastKey].setValue(STARTERS[0].id);
    expect(component.slotAssignmentForm.invalid).toBeTrue();
    expect(component.slotAssignmentForm.errors?.['duplicate']).toBeTrue();
  });

  it('prefills preset, starters and subs from an existing formation for the same preset', () => {
    const existingFormation: MatchFormation = {
      id: 'form1',
      matchId: 'm1',
      presetId: '1-2-3-1',
      slots: [
        {
          id: 'slot-gk',
          slotKey: 'gk',
          playerId: STARTERS[0].id,
          player: STARTERS[0],
          substitutes: [{ id: 'sub1', playerId: BENCH[0].id, player: BENCH[0] }],
        },
      ],
    };

    const fixture = setup({
      matchId: 'm1',
      match: MATCH,
      starters: STARTERS,
      bench: BENCH,
      existingFormation,
    });
    const component = fixture.componentInstance;

    expect(component.selectedPreset()?.id).toBe('1-2-3-1');
    expect(component.slotAssignmentForm.controls['gk'].value).toBe(STARTERS[0].id);
    expect(component.slotSubsForm.controls['gk'].value).toEqual([BENCH[0].id]);
  });

  it('confirmAndSave() PUTs the slot assignments and stores the saved formation', async () => {
    const fixture = setup({ matchId: 'm1', match: MATCH, starters: STARTERS, bench: BENCH, existingFormation: null });
    const component = fixture.componentInstance;
    const preset = component.presets.find((p) => p.id === '1-2-3-1')!;
    component.selectPreset(preset);
    preset.slots.forEach((slot, i) => component.slotAssignmentForm.controls[slot.key].setValue(STARTERS[i].id));
    component.slotSubsForm.controls['gk'].setValue([BENCH[0].id]);

    component.confirmAndSave();

    const req = httpMock.expectOne('/api/matches/m1/formation');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.presetId).toBe('1-2-3-1');
    expect(req.request.body.slots).toContain(
      jasmine.objectContaining({ slotKey: 'gk', playerId: STARTERS[0].id, subPlayerIds: [BENCH[0].id] })
    );

    const savedFormation: MatchFormation = {
      id: 'form1',
      matchId: 'm1',
      presetId: '1-2-3-1',
      slots: preset.slots.map((slot, i) => ({
        id: `slot-${slot.key}`,
        slotKey: slot.key,
        playerId: STARTERS[i].id,
        player: STARTERS[i],
        substitutes:
          slot.key === 'gk' ? [{ id: 'sub1', playerId: BENCH[0].id, player: BENCH[0] }] : [],
      })),
    };
    req.flush({ formation: savedFormation });

    expect(component.savedFormation()).toEqual(savedFormation);
    expect(component.saveError()).toBeNull();
    await fixture.whenStable(); // let the (canvas-based) preview promise settle
  });

  it('confirmAndSave() surfaces the backend error and does not save a formation', () => {
    const fixture = setup({ matchId: 'm1', match: MATCH, starters: STARTERS, bench: BENCH, existingFormation: null });
    const component = fixture.componentInstance;
    const preset = component.presets.find((p) => p.id === '1-2-3-1')!;
    component.selectPreset(preset);
    preset.slots.forEach((slot, i) => component.slotAssignmentForm.controls[slot.key].setValue(STARTERS[i].id));

    component.confirmAndSave();

    const req = httpMock.expectOne('/api/matches/m1/formation');
    req.flush({ message: 'Formación no reconocida' }, { status: 400, statusText: 'Bad Request' });

    expect(component.savedFormation()).toBeNull();
    expect(component.saveError()).toBe('Formación no reconocida');
  });

  it('close()/cancel() report whether a formation was actually saved', () => {
    const fixture = setup({ matchId: 'm1', match: MATCH, starters: STARTERS, bench: BENCH, existingFormation: null });
    fixture.componentInstance.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });
});
