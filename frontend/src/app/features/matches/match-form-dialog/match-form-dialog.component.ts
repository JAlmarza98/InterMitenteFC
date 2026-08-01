import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Match, MatchInput } from '../../../core/services/matches.service';
import { Season } from '../../../core/services/seasons.service';

export interface MatchFormDialogData {
  match: Match | null;
  seasons: Season[];
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-match-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './match-form-dialog.component.html',
})
export class MatchFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<MatchFormDialogComponent>);
  readonly data = inject<MatchFormDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.match;

  readonly form = this.fb.nonNullable.group({
    opponent: [this.data.match?.opponent ?? '', [Validators.required]],
    matchDate: [toDatetimeLocal(this.data.match?.matchDate), [Validators.required]],
    homeAway: [this.data.match?.homeAway ?? ('home' as 'home' | 'away'), [Validators.required]],
    competition: [this.data.match?.competition ?? ''],
    seasonId: [this.data.match?.seasonId ?? (null as string | null)],
    notes: [this.data.match?.notes ?? ''],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result: MatchInput = {
      opponent: raw.opponent,
      matchDate: new Date(raw.matchDate).toISOString(),
      homeAway: raw.homeAway,
      competition: raw.competition || null,
      seasonId: raw.seasonId || null,
      notes: raw.notes || null,
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
