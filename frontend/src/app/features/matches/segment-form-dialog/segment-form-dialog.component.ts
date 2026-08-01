import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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

@Component({
  selector: 'app-segment-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  templateUrl: './segment-form-dialog.component.html',
})
export class SegmentFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<SegmentFormDialogComponent>);
  readonly data = inject<SegmentFormDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.segment;
  readonly periodTypes = PERIOD_ORDER;
  readonly periodLabels = PERIOD_LABELS;

  readonly form = this.fb.nonNullable.group({
    playerId: [this.data.segment?.playerId ?? '', [Validators.required]],
    periodType: [this.data.segment?.periodType ?? PERIOD_ORDER[0], [Validators.required]],
    startMinute: [this.data.segment?.startMinute ?? 0, [Validators.required, Validators.min(0)]],
    endMinute: [this.data.segment?.endMinute ?? (null as number | null)],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result: ManualSegmentInput = {
      playerId: raw.playerId,
      periodType: raw.periodType,
      startMinute: raw.startMinute,
      endMinute: raw.endMinute,
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
