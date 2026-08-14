import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { FOOTBALL7_POSITIONS, Player, PlayerInput } from '../../../core/services/players.service';

@Component({
  selector: 'app-player-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './player-form-dialog.component.html',
})
export class PlayerFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<PlayerFormDialogComponent>);
  readonly data = inject<{ player: Player | null }>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.player;
  readonly positions = FOOTBALL7_POSITIONS;

  readonly primaryPosition = signal(this.data.player?.position ?? '');
  readonly secondaryPositionOptions = computed(() =>
    this.positions.filter((p) => p !== this.primaryPosition())
  );

  readonly form = this.fb.nonNullable.group({
    firstName: [this.data.player?.firstName ?? '', [Validators.required]],
    lastName: [this.data.player?.lastName ?? '', [Validators.required]],
    jerseyNumber: [this.data.player?.jerseyNumber ?? null as number | null],
    position: [this.data.player?.position ?? ''],
    secondaryPosition: [this.data.player?.secondaryPosition ?? ''],
  });

  onPrimaryPositionChange(value: string) {
    this.primaryPosition.set(value);
    if (this.form.controls.secondaryPosition.value === value) {
      this.form.controls.secondaryPosition.setValue('');
    }
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result: PlayerInput = {
      firstName: raw.firstName,
      lastName: raw.lastName,
      jerseyNumber: raw.jerseyNumber,
      position: raw.position || null,
      secondaryPosition: raw.secondaryPosition || null,
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
