import { Component, inject, signal } from '@angular/core';
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
  styleUrl: './match-detail.component.scss',
})
export class MatchDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly playersService = inject(PlayersService);
  private readonly seasonsService = inject(SeasonsService);
  private readonly matchEventsService = inject(MatchEventsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly canManage = this.auth.canManage;
  readonly statuses: MatchStatus[] = ['scheduled', 'live', 'finished'];
  readonly eventIcons = MATCH_EVENT_ICONS;
  readonly eventLabels = MATCH_EVENT_LABELS;
  readonly events = signal<MatchEvent[]>([]);

  formatEventTime(event: MatchEvent): string {
    return formatMinuteSeconds(event.second);
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
    row.starter = !row.starter;
    this.squadRows.set([...this.squadRows()]);
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
      error: () => this.savingSquad.set(false),
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
        this.matchesService.update(this.matchId, result).subscribe(() => {
          this.snackBar.open('Partido actualizado', 'Cerrar', { duration: 3000 });
          this.load();
        });
      });
    });
  }

  changeStatus(status: MatchStatus) {
    this.matchesService.update(this.matchId, { status }).subscribe(() => this.load());
  }

  updateScore(teamScore: string, opponentScore: string) {
    const team = teamScore === '' ? null : Number(teamScore);
    const opponent = opponentScore === '' ? null : Number(opponentScore);
    this.matchesService.update(this.matchId, { teamScore: team, opponentScore: opponent }).subscribe(() =>
      this.load()
    );
  }

  deleteMatch() {
    const match = this.match();
    if (!match || !confirm(`¿Eliminar el partido contra ${match.opponent}?`)) return;
    this.matchesService.delete(this.matchId).subscribe(() => {
      this.router.navigateByUrl('/matches');
    });
  }
}
