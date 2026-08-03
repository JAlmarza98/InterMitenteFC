import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Season, SeasonsService } from '../../../core/services/seasons.service';
import { SeasonFormDialogComponent } from '../season-form-dialog/season-form-dialog.component';

@Component({
  selector: 'app-season-list',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './season-list.component.html',
  styleUrl: './season-list.component.scss',
})
export class SeasonListComponent {
  private readonly seasonsService = inject(SeasonsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly displayedColumns = ['name', 'range', 'active', 'actions'];
  readonly seasons = signal<Season[]>([]);
  readonly loading = signal(false);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.seasonsService.list().subscribe({
      next: (res) => {
        this.seasons.set(res.seasons);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private showError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  openCreate() {
    const ref = this.dialog.open(SeasonFormDialogComponent, { data: { season: null }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.seasonsService.create(result).subscribe({
        next: () => {
          this.snackBar.open('Temporada creada', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.showError(err, 'No se pudo crear la temporada'),
      });
    });
  }

  openEdit(season: Season) {
    const ref = this.dialog.open(SeasonFormDialogComponent, { data: { season }, width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.seasonsService.update(season.id, result).subscribe({
        next: () => {
          this.snackBar.open('Temporada actualizada', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.showError(err, 'No se pudo actualizar la temporada'),
      });
    });
  }
}
