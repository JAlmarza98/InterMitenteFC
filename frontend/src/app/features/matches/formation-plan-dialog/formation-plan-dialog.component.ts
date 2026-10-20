import { Component, ViewChild, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import {
  FormationSlotInput,
  MatchesService,
  MatchFormation,
  MatchWithSquad,
} from '../../../core/services/matches.service';
import { Player } from '../../../core/services/players.service';
import { FORMATION_PRESETS, FormationPreset } from '../formation/formation-presets';
import { buildCallupMessage } from '../formation/callup-message';
import { COLOR_GROUP_HEX, renderFormationImage } from '../formation/pitch-canvas-renderer';
import { canShareFile, copyCallupText, downloadImage, shareCallup } from '../formation/share-callup';

export interface FormationPlanDialogData {
  matchId: string;
  match: MatchWithSquad;
  starters: Player[];
  bench: Player[];
  existingFormation: MatchFormation | null;
}

function allStartersUsedOnceValidator(group: AbstractControl): ValidationErrors | null {
  const values = Object.values((group as FormGroup).controls).map((c) => c.value as string);
  if (values.some((v) => !v)) return { incomplete: true };
  return new Set(values).size === values.length ? null : { duplicate: true };
}

@Component({
  selector: 'app-formation-plan-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatStepperModule,
  ],
  templateUrl: './formation-plan-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './formation-plan-dialog.component.scss',
})
export class FormationPlanDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<FormationPlanDialogComponent>);
  private readonly matchesService = inject(MatchesService);
  readonly data = inject<FormationPlanDialogData>(MAT_DIALOG_DATA);

  @ViewChild(MatStepper) private stepper?: MatStepper;

  readonly presets = FORMATION_PRESETS;
  /** So the preset-picker cards' mini pitch dots use the exact same
   * colorGroup→hex mapping as the generated share image — one source of
   * truth, not a second hardcoded palette in this component's CSS. */
  readonly colorGroupHex = COLOR_GROUP_HEX;

  readonly presetControl = new FormControl<string>(this.data.existingFormation?.presetId ?? '', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly selectedPreset = signal<FormationPreset | null>(
    this.presets.find((p) => p.id === this.presetControl.value) ?? null
  );

  slotAssignmentForm: FormGroup<Record<string, FormControl<string>>> = this.fb.nonNullable.group({});
  slotSubsForm: FormGroup<Record<string, FormControl<string[]>>> = this.fb.nonNullable.group({});

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly savedFormation = signal<MatchFormation | null>(null);
  readonly previewDataUrl = signal<string | null>(null);
  readonly rendering = signal(false);
  readonly canShare = signal(false);
  readonly sending = signal(false);
  readonly sendFeedback = signal<string | null>(null);
  readonly messageControl = new FormControl<string>('', { nonNullable: true });

  private shareFile: File | null = null;

  constructor() {
    if (this.selectedPreset()) {
      this.buildStepsForPreset(this.selectedPreset()!);
    }
  }

  selectPreset(preset: FormationPreset) {
    this.presetControl.setValue(preset.id);
    this.selectedPreset.set(preset);
    this.buildStepsForPreset(preset);
  }

  private buildStepsForPreset(preset: FormationPreset) {
    const prefill =
      this.data.existingFormation?.presetId === preset.id
        ? new Map(this.data.existingFormation.slots.map((s) => [s.slotKey, s]))
        : null;

    this.slotAssignmentForm = this.fb.nonNullable.group(
      Object.fromEntries(
        preset.slots.map((s) => [s.key, this.fb.nonNullable.control(prefill?.get(s.key)?.playerId ?? '')])
      ),
      { validators: [allStartersUsedOnceValidator] }
    );

    this.slotSubsForm = this.fb.nonNullable.group(
      Object.fromEntries(
        preset.slots.map((s) => [
          s.key,
          this.fb.nonNullable.control<string[]>(
            prefill?.get(s.key)?.substitutes.map((sub) => sub.playerId) ?? []
          ),
        ])
      )
    );
  }

  confirmAndSave() {
    const preset = this.selectedPreset();
    if (!preset) return;

    const slots: FormationSlotInput[] = preset.slots.map((s) => ({
      slotKey: s.key,
      playerId: this.slotAssignmentForm.controls[s.key].value,
      subPlayerIds: this.slotSubsForm.controls[s.key].value,
    }));

    this.saving.set(true);
    this.saveError.set(null);
    this.matchesService.setFormation(this.data.matchId, preset.id, slots).subscribe({
      next: ({ formation }) => {
        this.saving.set(false);
        this.savedFormation.set(formation);
        this.renderPreview(preset, formation);
        this.stepper?.next();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'No se pudo guardar la formación');
      },
    });
  }

  private renderPreview(preset: FormationPreset, formation: MatchFormation) {
    this.rendering.set(true);
    renderFormationImage(this.data.match, preset, formation)
      .then(async ({ dataUrl, toBlob }) => {
        this.previewDataUrl.set(dataUrl);
        this.messageControl.setValue(buildCallupMessage(this.data.match, preset, formation));
        const blob = await toBlob();
        this.shareFile = new File([blob], 'convocatoria.png', { type: 'image/png' });
        this.canShare.set(canShareFile(this.shareFile));
      })
      .finally(() => this.rendering.set(false));
  }

  async share() {
    if (!this.shareFile) return;
    this.sending.set(true);
    this.sendFeedback.set(null);
    const result = await shareCallup(this.shareFile, this.messageControl.value, 'Convocatoria');
    this.sending.set(false);
    if (result === 'shared') this.sendFeedback.set('Compartido');
    else if (result === 'error') this.sendFeedback.set('No se pudo compartir — prueba a descargar/copiar');
  }

  download() {
    if (!this.previewDataUrl()) return;
    downloadImage(this.previewDataUrl()!, `convocatoria-${this.data.match.opponent}.png`);
  }

  async copyText() {
    const ok = await copyCallupText(this.messageControl.value);
    this.sendFeedback.set(ok ? 'Texto copiado' : 'No se pudo copiar el texto');
  }

  close() {
    this.dialogRef.close(!!this.savedFormation());
  }

  cancel() {
    this.dialogRef.close(!!this.savedFormation());
  }
}
