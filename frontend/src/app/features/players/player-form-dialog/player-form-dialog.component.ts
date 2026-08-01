import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Player, PlayerInput } from '../../../core/services/players.service';

@Component({
  selector: 'app-player-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './player-form-dialog.component.html',
})
export class PlayerFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<PlayerFormDialogComponent>);
  readonly data = inject<{ player: Player | null }>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.player;

  readonly form = this.fb.nonNullable.group({
    firstName: [this.data.player?.firstName ?? '', [Validators.required]],
    lastName: [this.data.player?.lastName ?? '', [Validators.required]],
    jerseyNumber: [this.data.player?.jerseyNumber ?? null as number | null],
    position: [this.data.player?.position ?? ''],
  });

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
    };
    this.dialogRef.close(result);
  }

  cancel() {
    this.dialogRef.close();
  }
}
