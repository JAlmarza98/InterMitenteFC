import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Season, SeasonInput } from '../../../core/services/seasons.service';

@Component({
  selector: 'app-season-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatCheckboxModule,
  ],
  templateUrl: './season-form-dialog.component.html',
})
export class SeasonFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<SeasonFormDialogComponent>);
  readonly data = inject<{ season: Season | null }>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.season;

  readonly form = this.fb.nonNullable.group({
    name: [this.data.season?.name ?? '', [Validators.required]],
    startDate: [
      this.data.season?.startDate ? new Date(this.data.season.startDate) : (null as Date | null),
      [Validators.required],
    ],
    endDate: [
      this.data.season?.endDate ? new Date(this.data.season.endDate) : (null as Date | null),
      [Validators.required],
    ],
    isActive: [this.data.season?.isActive ?? false],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result: SeasonInput = {
      name: raw.name,
      startDate: raw.startDate!.toISOString(),
      endDate: raw.endDate!.toISOString(),
      isActive: raw.isActive,
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
