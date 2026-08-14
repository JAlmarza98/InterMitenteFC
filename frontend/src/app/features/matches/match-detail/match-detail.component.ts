import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { MatchesService, MatchStatus, MatchWithSquad } from '../../../core/services/matches.service';
import { SeasonsService } from '../../../core/services/seasons.service';
import { Player, PlayersService } from '../../../core/services/players.service';
import {
  MATCH_EVENT_ICONS,
  MATCH_EVENT_LABELS,
  MatchEvent,
  MatchEventsService,
} from '../../../core/services/match-events.service';
import { formatMinuteSeconds } from '../../../core/services/match-clock.service';
import { MatchPlayerStatRow, StatsService } from '../../../core/services/stats.service';
import { MatchFormDialogComponent } from '../match-form-dialog/match-form-dialog.component';

interface SquadRow {
  player: Player;
  called: boolean;
  starter: boolean;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Programado',
  live: 'En juego',
  finished: 'Finalizado',
};

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './match-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './match-detail.component.scss',
})
export class MatchDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly playersService = inject(PlayersService);
  private readonly seasonsService = inject(SeasonsService);
  private readonly matchEventsService = inject(MatchEventsService);
  private readonly statsService = inject(StatsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly canManage = this.auth.canManage;
  /** The squad (called up / starter) only makes sense to edit before kickoff
   * — once the match is live or finished, who actually played is tracked
   * via substitutions and playing-time segments instead. */
  readonly canEditSquad = computed(() => this.canManage() && this.match()?.status === 'scheduled');
  readonly statuses: MatchStatus[] = ['scheduled', 'live', 'finished'];
  readonly eventIcons = MATCH_EVENT_ICONS;
  readonly eventLabels = MATCH_EVENT_LABELS;
  readonly events = signal<MatchEvent[]>([]);
  readonly playerStats = signal<MatchPlayerStatRow[]>([]);

  /** Only players who actually stepped on the pitch or racked up a stat —
   * `playerStats` also includes called-up players who never left the bench. */
  readonly playedPlayerStats = computed(() =>
    this.playerStats().filter(
      (row) =>
        row.secondsPlayed > 0 ||
        row.goals > 0 ||
        row.assists > 0 ||
        row.yellowCards > 0 ||
        row.redCards > 0 ||
        row.ownGoals > 0
    )
  );

  formatEventTime(event: MatchEvent): string {
    return formatMinuteSeconds(event.second);
  }

  formatPlayedTime(seconds: number): string {
    return formatMinuteSeconds(seconds);
  }

  eventPlayerName(event: MatchEvent): string {
    return event.player ? `${event.player.firstName} ${event.player.lastName}` : '';
  }

  eventDescription(event: MatchEvent): string {
    if (event.type === 'substitution') {
      const inName = this.eventPlayerName(event);
      const outName = event.relatedPlayer ? `${event.relatedPlayer.firstName} ${event.relatedPlayer.lastName}` : '';
      return `Entra ${inName}, sale ${outName}`;
    }
    return `${this.eventLabels[event.type]}: ${this.eventPlayerName(event)}`;
  }

  statusLabel(status: MatchStatus): string {
    return STATUS_LABELS[status];
  }

  readonly matchId = this.route.snapshot.paramMap.get('id')!;
  readonly match = signal<MatchWithSquad | null>(null);
  readonly squadRows = signal<SquadRow[]>([]);
  readonly loading = signal(false);
  readonly savingSquad = signal(false);

  /** Fútbol 7: the starting XI is always exactly 7. */
  readonly requiredStarters = 7;
  readonly startersCount = computed(() => this.squadRows().filter((r) => r.starter).length);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.matchesService.get(this.matchId).subscribe({
      next: (res) => {
        this.match.set(res.match);
        this.loadSquadRows(res.match);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.matchEventsService.list(this.matchId).subscribe((res) => this.events.set(res.events));
    this.statsService.getMatchStats(this.matchId).subscribe((res) => this.playerStats.set(res.players));
  }

  private loadSquadRows(match: MatchWithSquad) {
    this.playersService.list(false).subscribe((res) => {
      const calledMap = new Map(match.squad.map((s) => [s.playerId, s]));
      this.squadRows.set(
        res.players.map((player) => {
          const entry = calledMap.get(player.id);
          return { player, called: !!entry, starter: entry?.isStarter ?? false };
        })
      );
    });
  }

  toggleCalled(row: SquadRow) {
    row.called = !row.called;
    if (!row.called) row.starter = false;
    this.squadRows.set([...this.squadRows()]);
  }

  toggleStarter(row: SquadRow) {
    if (!row.called) return;
    if (!row.starter && this.startersCount() >= this.requiredStarters) {
      this.snackBar.open(`Ya hay ${this.requiredStarters} titulares seleccionados (fútbol 7)`, 'Cerrar', {
        duration: 3000,
      });
      return;
    }
    row.starter = !row.starter;
    this.squadRows.set([...this.squadRows()]);
  }

  private showError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  saveSquad() {
    const players = this.squadRows()
      .filter((r) => r.called)
      .map((r) => ({ playerId: r.player.id, isStarter: r.starter }));

    this.savingSquad.set(true);
    this.matchesService.setSquad(this.matchId, players).subscribe({
      next: () => {
        this.savingSquad.set(false);
        this.snackBar.open('Convocatoria guardada', 'Cerrar', { duration: 3000 });
        this.load();
      },
      error: (err) => {
        this.savingSquad.set(false);
        this.showError(err, 'No se pudo guardar la convocatoria');
      },
    });
  }

  editMatch() {
    const match = this.match();
    if (!match) return;
    this.seasonsService.list().subscribe((seasonsRes) => {
      const ref = this.dialog.open(MatchFormDialogComponent, {
        data: { match, seasons: seasonsRes.seasons },
        width: '480px',
      });
      ref.afterClosed().subscribe((result) => {
        if (!result) return;
        this.matchesService.update(this.matchId, result).subscribe({
          next: () => {
            this.snackBar.open('Partido actualizado', 'Cerrar', { duration: 3000 });
            this.load();
          },
          error: (err) => this.showError(err, 'No se pudo actualizar el partido'),
        });
      });
    });
  }

  changeStatus(status: MatchStatus) {
    this.matchesService.update(this.matchId, { status }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.showError(err, 'No se pudo cambiar el estado del partido');
        this.load(); // revert the select back to the actual stored status
      },
    });
  }

  updateScore(teamScore: string, opponentScore: string) {
    const team = teamScore === '' ? null : Number(teamScore);
    const opponent = opponentScore === '' ? null : Number(opponentScore);
    this.matchesService.update(this.matchId, { teamScore: team, opponentScore: opponent }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.showError(err, 'No se pudo guardar el marcador');
        this.load(); // revert the inputs back to the actual stored score
      },
    });
  }

  deleteMatch() {
    const match = this.match();
    if (!match || !confirm(`¿Eliminar el partido contra ${match.opponent}?`)) return;
    this.matchesService.delete(this.matchId).subscribe({
      next: () => this.router.navigateByUrl('/matches'),
      error: (err) => this.showError(err, 'No se pudo eliminar el partido'),
    });
  }
}
