import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { Match, MatchesService } from '../../../core/services/matches.service';
import { SeasonsService } from '../../../core/services/seasons.service';
import { MatchFormDialogComponent } from '../match-form-dialog/match-form-dialog.component';

const STATUS_LABELS: Record<Match['status'], string> = {
  scheduled: 'Programado',
  live: 'En juego',
  finished: 'Finalizado',
};

@Component({
  selector: 'app-match-list',
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
  templateUrl: './match-list.component.html',
  styleUrl: './match-list.component.scss',
})
export class MatchListComponent {
  private readonly matchesService = inject(MatchesService);
  private readonly seasonsService = inject(SeasonsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly canManage = this.auth.canManage;
  readonly displayedColumns = ['date', 'opponent', 'competition', 'status', 'score', 'actions'];

  readonly matches = signal<Match[]>([]);
  readonly loading = signal(false);

  statusLabel(status: Match['status']): string {
    return STATUS_LABELS[status];
  }

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.matchesService.list().subscribe({
      next: (res) => {
        this.matches.set(res.matches);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openMatch(match: Match) {
    this.router.navigate(['/matches', match.id]);
  }

  private showError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  openCreate() {
    this.seasonsService.list().subscribe((seasonsRes) => {
      const ref = this.dialog.open(MatchFormDialogComponent, {
        data: { match: null, seasons: seasonsRes.seasons },
        width: '480px',
      });
      ref.afterClosed().subscribe((result) => {
        if (!result) return;
        this.matchesService.create(result).subscribe({
          next: () => {
            this.snackBar.open('Partido creado', 'Cerrar', { duration: 3000 });
            this.load();
          },
          error: (err) => this.showError(err, 'No se pudo crear el partido'),
        });
      });
    });
  }

  deleteMatch(event: Event, match: Match) {
    event.stopPropagation();
    if (!confirm(`¿Eliminar el partido contra ${match.opponent}?`)) return;
    this.matchesService.delete(match.id).subscribe({
      next: () => {
        this.snackBar.open('Partido eliminado', 'Cerrar', { duration: 3000 });
        this.load();
      },
      error: (err) => this.showError(err, 'No se pudo eliminar el partido'),
    });
  }
}
