import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { MatchPlayerStatRow, StatsService } from '../../../core/services/stats.service';
import {
  MatchClockService,
  PERIOD_LABELS,
  Segment,
} from '../../../core/services/match-clock.service';
import { SegmentFormDialogComponent } from '../segment-form-dialog/segment-form-dialog.component';

@Component({
  selector: 'app-match-stats',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './match-stats.component.html',
  styleUrl: './match-stats.component.scss',
})
export class MatchStatsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly statsService = inject(StatsService);
  private readonly clockService = inject(MatchClockService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly canManage = () => ['admin', 'coach'].includes(this.auth.role() ?? '');
  readonly matchId = this.route.snapshot.paramMap.get('id')!;

  readonly statColumns = ['name', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards', 'ownGoals'];
  readonly segmentColumns = ['player', 'period', 'startMinute', 'endMinute', 'source', 'actions'];

  periodLabel(type: Segment['periodType']): string {
    return PERIOD_LABELS[type];
  }

  readonly players = signal<MatchPlayerStatRow[]>([]);
  readonly segments = signal<Segment[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.statsService.getMatchStats(this.matchId).subscribe({
      next: (res) => {
        this.players.set(res.players);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.clockService.listSegments(this.matchId).subscribe((res) => this.segments.set(res.segments));
  }

  updateStat(row: MatchPlayerStatRow, field: 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'ownGoals', value: string) {
    const parsed = Math.max(0, Number(value) || 0);
    this.statsService.upsertPlayerStat(this.matchId, row.playerId, { [field]: parsed }).subscribe({
      next: () => this.load(),
      error: () => this.snackBar.open('No se pudo guardar', 'Cerrar', { duration: 3000 }),
    });
  }

  openCreateSegment() {
    const ref = this.dialog.open(SegmentFormDialogComponent, {
      data: { segment: null, players: this.players().map((p) => p.player) },
      width: '420px',
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.clockService.createSegment(this.matchId, result).subscribe({
        next: () => {
          this.snackBar.open('Tiempo de juego añadido', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.snackBar.open(err.error?.error ?? 'No se pudo guardar', 'Cerrar', { duration: 3000 }),
      });
    });
  }

  openEditSegment(segment: Segment) {
    const ref = this.dialog.open(SegmentFormDialogComponent, {
      data: { segment, players: this.players().map((p) => p.player) },
      width: '420px',
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.clockService.updateSegment(this.matchId, segment.id, result).subscribe({
        next: () => {
          this.snackBar.open('Tiempo de juego actualizado', 'Cerrar', { duration: 3000 });
          this.load();
        },
        error: (err) => this.snackBar.open(err.error?.error ?? 'No se pudo guardar', 'Cerrar', { duration: 3000 }),
      });
    });
  }

  deleteSegment(segment: Segment) {
    if (!confirm(`¿Eliminar este tiempo de juego de ${segment.player.firstName}?`)) return;
    this.clockService.deleteSegment(this.matchId, segment.id).subscribe(() => {
      this.snackBar.open('Tiempo de juego eliminado', 'Cerrar', { duration: 3000 });
      this.load();
    });
  }
}
