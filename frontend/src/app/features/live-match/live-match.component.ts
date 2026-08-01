import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatchesService, MatchWithSquad } from '../../core/services/matches.service';
import {
  ClockState,
  MatchClockService,
  PERIOD_LABELS,
  PERIOD_OFFSET_MINUTES,
  PERIOD_ORDER,
  PeriodType,
  Segment,
  elapsedSecondsInPeriod,
  formatMinuteSeconds,
} from '../../core/services/match-clock.service';

interface RosterRow {
  playerId: string;
  name: string;
  isStarter: boolean;
  onPitch: boolean;
}

@Component({
  selector: 'app-live-match',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './live-match.component.html',
  styleUrl: './live-match.component.scss',
})
export class LiveMatchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly clockService = inject(MatchClockService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly matchId = this.route.snapshot.paramMap.get('id')!;
  readonly periodLabels = PERIOD_LABELS;

  readonly loading = signal(true);
  readonly actionLoading = signal(false);
  readonly match = signal<MatchWithSquad | null>(null);
  readonly clockState = signal<ClockState | null>(null);
  readonly segments = signal<Segment[]>([]);
  readonly selectedIncomingId = signal<string | null>(null);

  private offsetMs = 0;
  private readonly nowTick = signal(Date.now());

  readonly activePeriod = computed(() => {
    const state = this.clockState();
    if (!state?.activePeriodType) return null;
    return state.periods.find((p) => p.type === state.activePeriodType) ?? null;
  });

  readonly elapsedDisplay = computed(() => {
    const period = this.activePeriod();
    if (!period) return null;
    const now = new Date(this.nowTick() + this.offsetMs);
    const seconds = elapsedSecondsInPeriod(period, now);
    return formatMinuteSeconds(PERIOD_OFFSET_MINUTES[period.type] * 60 + seconds);
  });

  readonly nextPeriodType = computed<PeriodType | null>(() => {
    const periods = this.clockState()?.periods ?? [];
    let lastStartedIndex = -1;
    PERIOD_ORDER.forEach((type, i) => {
      if (periods.some((p) => p.type === type && p.startedAt)) lastStartedIndex = i;
    });
    return PERIOD_ORDER[lastStartedIndex + 1] ?? null;
  });

  readonly canStartNext = computed(() => !this.clockState()?.activePeriodType && this.nextPeriodType() !== null);

  readonly onPitch = computed<RosterRow[]>(() => this.roster().filter((r) => r.onPitch));
  readonly bench = computed<RosterRow[]>(() => this.roster().filter((r) => !r.onPitch));

  private readonly roster = computed<RosterRow[]>(() => {
    const match = this.match();
    if (!match) return [];
    const onPitchIds = new Set(this.segments().filter((s) => s.endMinute === null).map((s) => s.playerId));
    return match.squad.map((entry) => ({
      playerId: entry.playerId,
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      isStarter: entry.isStarter,
      onPitch: onPitchIds.has(entry.playerId),
    }));
  });

  constructor() {
    this.loadAll();

    const tickHandle = setInterval(() => this.nowTick.set(Date.now()), 1000);
    const resyncHandle = setInterval(() => this.loadClock(), 25000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.loadClock();
    };
    document.addEventListener('visibilitychange', onVisible);

    this.destroyRef.onDestroy(() => {
      clearInterval(tickHandle);
      clearInterval(resyncHandle);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private loadAll() {
    this.loading.set(true);
    this.matchesService.get(this.matchId).subscribe({
      next: (res) => {
        this.match.set(res.match);
        this.loadClock();
        this.loadSegments();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadClock() {
    this.clockService.getClock(this.matchId).subscribe((state) => {
      this.offsetMs = new Date(state.serverNow).getTime() - Date.now();
      this.clockState.set(state);
    });
  }

  private loadSegments() {
    this.clockService.listSegments(this.matchId).subscribe((res) => this.segments.set(res.segments));
  }

  private refreshClockAndSegments() {
    this.loadClock();
    this.loadSegments();
  }

  startNextPeriod() {
    const type = this.nextPeriodType();
    if (!type) return;
    this.actionLoading.set(true);
    this.clockService.startPeriod(this.matchId, type).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.refreshClockAndSegments();
      },
      error: () => this.actionLoading.set(false),
    });
  }

  pause() {
    this.clockService.pause(this.matchId).subscribe(() => this.loadClock());
  }

  resume() {
    this.clockService.resume(this.matchId).subscribe(() => this.loadClock());
  }

  endPeriod() {
    this.clockService.endPeriod(this.matchId).subscribe(() => this.refreshClockAndSegments());
  }

  finishMatch() {
    if (!confirm('¿Finalizar el partido? Se cerrará el tiempo de juego de los jugadores en pista.')) return;
    this.clockService.finish(this.matchId).subscribe(() => {
      this.snackBar.open('Partido finalizado', 'Cerrar', { duration: 3000 });
      this.router.navigate(['/matches', this.matchId]);
    });
  }

  selectIncoming(playerId: string) {
    this.selectedIncomingId.set(this.selectedIncomingId() === playerId ? null : playerId);
  }

  substituteWith(outPlayerId: string) {
    const inPlayerId = this.selectedIncomingId();
    if (!inPlayerId) {
      this.snackBar.open('Selecciona primero un jugador del banquillo', 'Cerrar', { duration: 3000 });
      return;
    }
    this.clockService.substitute(this.matchId, outPlayerId, inPlayerId).subscribe({
      next: () => {
        this.selectedIncomingId.set(null);
        this.refreshClockAndSegments();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error ?? 'No se pudo realizar el cambio', 'Cerrar', { duration: 3000 });
      },
    });
  }
}
