import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { Player, PlayersService } from '../../../core/services/players.service';
import {
  formatRating,
  ratingTier,
  MatchPlayerStatRow,
  PlayerStatField,
  StatsService,
} from '../../../core/services/stats.service';
import {
  MatchClockService,
  PERIOD_LABELS,
  Segment,
  formatMinuteSeconds,
} from '../../../core/services/match-clock.service';
import { SegmentFormDialogComponent } from '../segment-form-dialog/segment-form-dialog.component';
import { IconComponent } from '../../../shared/icon/icon.component';

interface StatColumn {
  field: PlayerStatField;
  label: string;
  /** Mobile card label — the 4-column grid has room for very little. */
  shortLabel: string;
  header: string;
  max?: number;
}

function emptyRow(player: Player): MatchPlayerStatRow {
  return {
    playerId: player.id,
    player,
    isStarter: false,
    inSquad: false,
    secondsPlayed: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltyGoals: 0,
    penaltiesWon: 0,
    rating: null,
  };
}

@Component({
  selector: 'app-match-stats',
  standalone: true,
  imports: [RouterLink, MatDialogModule, MatMenuModule, MatSnackBarModule, MatProgressSpinnerModule, IconComponent],
  templateUrl: './match-stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './match-stats.component.scss',
})
export class MatchStatsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly statsService = inject(StatsService);
  private readonly clockService = inject(MatchClockService);
  private readonly playersService = inject(PlayersService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  // This screen corrects already-recorded numbers (as opposed to live-match's
  // append-only event log), so it's scoped to admin — narrower than the
  // coach/admin canManage used everywhere else in the match feature.
  readonly canManage = this.auth.isAdmin;
  readonly matchId = this.route.snapshot.paramMap.get('id')!;

  periodLabel(type: Segment['periodType']): string {
    return PERIOD_LABELS[type];
  }

  formatTime(totalSeconds: number): string {
    return formatMinuteSeconds(totalSeconds);
  }

  endLabel(seg: Segment): string {
    return seg.endSecond !== null ? this.formatTime(seg.endSecond) : '—';
  }

  sourceLabel(source: Segment['source']): string {
    return source === 'live' ? 'En vivo' : 'Manual';
  }

  // Mobile shows one concatenated line per segment (the mockup has no room
  // for a 5-column row there); tablet keeps period/entra/sale/origen as
  // separate table cells instead — see the two markup blocks in the template.
  segmentDescription(seg: Segment): string {
    return `${this.periodLabel(seg.periodType)} · ${this.formatTime(seg.startSecond)} – ${this.endLabel(seg)} · ${this.sourceLabel(seg.source)}`;
  }

  readonly formatRating = formatRating;
  readonly ratingTier = ratingTier;

  // Same order everywhere these stats are listed: scoring, then chance
  // creation, then discipline.
  readonly statColumns: StatColumn[] = [
    { field: 'goals', label: 'Goles', shortLabel: 'Goles', header: 'Goles' },
    { field: 'penaltyGoals', label: 'Goles de penalti', shortLabel: 'G. pen.', header: 'G. pen.' },
    { field: 'assists', label: 'Asistencias', shortLabel: 'Asist.', header: 'Asist.' },
    { field: 'penaltiesWon', label: 'Penaltis provocados', shortLabel: 'P. prov.', header: 'P. prov.' },
    { field: 'yellowCards', label: 'Tarjetas amarillas', shortLabel: 'TA', header: 'TA', max: 2 },
    { field: 'redCards', label: 'Tarjetas rojas', shortLabel: 'TR', header: 'TR', max: 1 },
    { field: 'ownGoals', label: 'Goles en propia', shortLabel: 'G.p.', header: 'G. propia' },
  ];

  readonly players = signal<MatchPlayerStatRow[]>([]);
  readonly segments = signal<Segment[]>([]);
  readonly loading = signal(true);

  /** Whole roster, inactive players included — a player who has since left
   * may still have played this match. Source for adding someone who wasn't
   * called up. */
  private readonly allPlayers = signal<Player[]>([]);
  /** Players the admin picked from "Añadir jugador" in this visit. They
   * only come back from the API once they have a non-zero stat or some
   * playing time, so until then they're kept here as a blank row. */
  private readonly addedPlayerIds = signal<string[]>([]);

  readonly rows = computed<MatchPlayerStatRow[]>(() => {
    const fetched = this.players();
    const listed = new Set(fetched.map((row) => row.playerId));
    const byId = new Map(this.allPlayers().map((player) => [player.id, player]));
    const added = this.addedPlayerIds()
      .filter((id) => !listed.has(id) && byId.has(id))
      .map((id) => emptyRow(byId.get(id)!));
    return [...fetched, ...added];
  });

  readonly addablePlayers = computed<Player[]>(() => {
    const listed = new Set(this.rows().map((row) => row.playerId));
    return this.allPlayers().filter((player) => !listed.has(player.id));
  });

  /** Everyone already on the stats list first, then the rest of the
   * roster, so playing time can be logged for a non-called-up player too. */
  private readonly segmentPlayers = computed<Player[]>(() => [
    ...this.rows().map((row) => row.player),
    ...this.addablePlayers(),
  ]);

  constructor() {
    this.load();
    this.playersService.list(true).subscribe((res) => this.allPlayers.set(res.players));
  }

  addPlayer(player: Player) {
    this.addedPlayerIds.set([...this.addedPlayerIds(), player.id]);
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

  updateStat(row: MatchPlayerStatRow, field: PlayerStatField, value: string) {
    const parsed = Math.max(0, Number(value) || 0);
    this.statsService.upsertPlayerStat(this.matchId, row.playerId, { [field]: parsed }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.snackBar.open(err.error?.error ?? 'No se pudo guardar', 'Cerrar', { duration: 3000 });
        // Put the input back to the stored value instead of leaving the
        // rejected one on screen as if it had been saved.
        this.load();
      },
    });
  }

  openCreateSegment() {
    const ref = this.dialog.open(SegmentFormDialogComponent, {
      data: { segment: null, players: this.segmentPlayers() },
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
      data: { segment, players: this.segmentPlayers() },
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
