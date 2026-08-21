import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { Match, MatchesService } from '../../../core/services/matches.service';
import { Season, SeasonsService } from '../../../core/services/seasons.service';
import { MatchFormDialogComponent } from '../match-form-dialog/match-form-dialog.component';
import { IconComponent } from '../../../shared/icon/icon.component';

const STATUS_LABELS: Record<Match['status'], string> = {
  scheduled: 'Programado',
  live: 'En vivo',
  finished: 'Finalizado',
};

@Component({
  selector: 'app-match-list',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatSnackBarModule, MatProgressSpinnerModule, IconComponent],
  templateUrl: './match-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
  readonly isAdmin = this.auth.isAdmin;

  // Scoped to the active season, same as the Home hero/season panel — the
  // mockup's "Temporada 2025/26 · 6 partidos" subheading only makes sense
  // against a single season's matches, not every match ever played.
  readonly season = signal<Season | null>(null);
  readonly matches = signal<Match[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  statusLabel(status: Match['status']): string {
    return STATUS_LABELS[status];
  }

  isToday(dateStr: string): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.seasonsService.list().subscribe({
      next: (res) => {
        const active = res.seasons.find((s) => s.isActive) ?? res.seasons[0] ?? null;
        this.season.set(active);
        if (!active) {
          this.matches.set([]);
          this.loading.set(false);
          return;
        }
        this.matchesService.list(active.id).subscribe({
          next: (matchesRes) => {
            this.matches.set(matchesRes.matches);
            this.loading.set(false);
          },
          error: (err) => {
            this.loading.set(false);
            this.loadError.set(true);
            this.showError(err, 'No se pudieron cargar los partidos');
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(true);
        this.showError(err, 'No se pudieron cargar los partidos');
      },
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
