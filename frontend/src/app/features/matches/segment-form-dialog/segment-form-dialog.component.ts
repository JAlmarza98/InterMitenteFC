import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Player } from '../../../core/services/players.service';
import { ManualSegmentInput, PERIOD_LABELS, PERIOD_ORDER, Segment } from '../../../core/services/match-clock.service';

export interface SegmentFormDialogData {
  segment: Segment | null;
  players: Player[];
}

/** Rejects a "sale" timestamp earlier than "entra" — the raw min/max
 * validators on each field can't see across fields, so nothing otherwise
 * stops e.g. entering minute 20 as the start and minute 5 as the end. */
function endNotBeforeStart(group: AbstractControl): ValidationErrors | null {
  const endMinute = group.get('endMinute')?.value;
  if (endMinute == null) return null;

  const startMinute = group.get('startMinute')?.value ?? 0;
  const startSecond = group.get('startSecond')?.value ?? 0;
  const endSecond = group.get('endSecond')?.value ?? 0;

  const start = startMinute * 60 + (startSecond || 0);
  const end = endMinute * 60 + (endSecond || 0);
  return end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-segment-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  templateUrl: './segment-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './segment-form-dialog.component.scss',
})
export class SegmentFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<SegmentFormDialogComponent>);
  readonly data = inject<SegmentFormDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.segment;
  readonly periodTypes = PERIOD_ORDER;
  readonly periodLabels = PERIOD_LABELS;

  private readonly startMin = this.data.segment ? Math.floor(this.data.segment.startSecond / 60) : 0;
  private readonly startSec = this.data.segment ? this.data.segment.startSecond % 60 : 0;
  private readonly endMin = this.data.segment?.endSecond != null ? Math.floor(this.data.segment.endSecond / 60) : null;
  private readonly endSec = this.data.segment?.endSecond != null ? this.data.segment.endSecond % 60 : null;

  readonly form = this.fb.nonNullable.group(
    {
      playerId: [this.data.segment?.playerId ?? '', [Validators.required]],
      periodType: [this.data.segment?.periodType ?? PERIOD_ORDER[0], [Validators.required]],
      startMinute: [this.startMin, [Validators.required, Validators.min(0)]],
      startSecond: [this.startSec, [Validators.min(0), Validators.max(59)]],
      endMinute: [this.endMin as number | null],
      endSecond: [this.endSec as number | null, [Validators.min(0), Validators.max(59)]],
    },
    { validators: endNotBeforeStart }
  );

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result: ManualSegmentInput = {
      playerId: raw.playerId,
      periodType: raw.periodType,
      startSecond: raw.startMinute * 60 + (raw.startSecond || 0),
      endSecond: raw.endMinute != null ? raw.endMinute * 60 + (raw.endSecond || 0) : null,
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
