import { Component, DestroyRef, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { LiveUpdatesService } from '../../core/services/live-updates.service';
import { MatchesService, MatchWithSquad } from '../../core/services/matches.service';
import { StatsService } from '../../core/services/stats.service';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { FlashOnChangeDirective } from '../../shared/directives/flash-on-change.directive';
import {
  MATCH_EVENT_LABELS,
  LoggableEventType,
  MatchEvent,
  MatchEventsService,
  MatchEventType,
} from '../../core/services/match-events.service';
import {
  ClockState,
  MatchClockService,
  PERIOD_LABELS,
  PERIOD_ORDER,
  PeriodType,
  Segment,
  elapsedSecondsInPeriod,
  formatMinuteSeconds,
  periodOffsetSeconds,
} from '../../core/services/match-clock.service';

type StatField = 'goals' | 'assists' | 'yellowCards' | 'redCards';

const STAT_EVENT_TYPE_BY_FIELD: Record<StatField, Exclude<LoggableEventType, 'opponent_goal'>> = {
  goals: 'goal',
  assists: 'assist',
  yellowCards: 'yellow_card',
  redCards: 'red_card',
};

interface LiveStatCounts {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

interface RosterRow {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  position: string | null;
  isStarter: boolean;
  onPitch: boolean;
  isRedCarded: boolean;
  stats: LiveStatCounts;
  playedDisplay: string;
}

const EMPTY_STATS: LiveStatCounts = { goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

// Same mapping/reasoning as match-detail's EVENT_ICON_NAMES — a stroked
// ball for goals, a stroked swap arrow for substitutions. Cards render as
// a small filled rect directly in the template (see .event-card-icon)
// since they're a solid shape, not a stroke glyph like the rest of the set.
const EVENT_ICON_NAMES: Partial<Record<MatchEventType, IconName>> = {
  goal: 'ball',
  opponent_goal: 'ball',
  own_goal: 'ball',
  assist: 'assist',
  substitution: 'swap',
};

@Component({
  selector: 'app-live-match',
  standalone: true,
  imports: [RouterLink, MatSnackBarModule, MatProgressSpinnerModule, IconComponent, FlashOnChangeDirective],
  templateUrl: './live-match.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './live-match.component.scss',
})
export class LiveMatchComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly clockService = inject(MatchClockService);
  private readonly statsService = inject(StatsService);
  private readonly matchEventsService = inject(MatchEventsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly liveUpdates = inject(LiveUpdatesService);

  readonly matchId = this.route.snapshot.paramMap.get('id')!;
  readonly periodLabels = PERIOD_LABELS;
  readonly eventLabels = MATCH_EVENT_LABELS;

  // Coach/admin get the full editable tracker (clock controls, stat
  // buttons, substitutions); a plain member gets a read-only view of the
  // same live data (score, clock, who's on the pitch and for how long) —
  // see AuthService.canManage.
  readonly canManage = this.auth.canManage;

  eventIconName(type: MatchEventType): IconName {
    return EVENT_ICON_NAMES[type] ?? 'ball';
  }

  readonly activeRosterTab = signal<'pitch' | 'bench'>('pitch');

  setRosterTab(tab: 'pitch' | 'bench') {
    this.activeRosterTab.set(tab);
  }

  readonly loading = signal(true);
  readonly actionLoading = signal(false);
  /** Set whenever a background resync (25s poll, tab-visibility resync, or
   * any of the loadX() calls) fails — the live clock/roster can otherwise
   * look current while silently being stale mid-match, with no indication
   * to the coach that anything is wrong. */
  readonly syncError = signal(false);
  readonly loadError = signal(false);
  readonly match = signal<MatchWithSquad | null>(null);
  readonly clockState = signal<ClockState | null>(null);
  readonly segments = signal<Segment[]>([]);
  readonly statsByPlayer = signal<Map<string, LiveStatCounts>>(new Map());
  readonly selectedIncomingId = signal<string | null>(null);
  readonly events = signal<MatchEvent[]>([]);

  readonly recentEvents = computed(() => [...this.events()].reverse());

  eventPlayerName(event: MatchEvent): string {
    return event.player ? `${event.player.firstName} ${event.player.lastName}` : '';
  }

  formatEventTime(event: MatchEvent): string {
    return formatMinuteSeconds(event.second);
  }

  eventDescription(event: MatchEvent): string {
    if (event.type === 'substitution') {
      const inName = this.eventPlayerName(event);
      const outName = event.relatedPlayer ? `${event.relatedPlayer.firstName} ${event.relatedPlayer.lastName}` : '';
      return `Entra ${inName}, sale ${outName}`;
    }
    if (event.type === 'opponent_goal') {
      return this.eventLabels[event.type];
    }
    return `${this.eventLabels[event.type]}: ${this.eventPlayerName(event)}`;
  }

  private offsetMs = 0;
  private readonly nowTick = signal(Date.now());

  readonly activePeriod = computed(() => {
    const state = this.clockState();
    if (!state?.activePeriodType) return null;
    return state.periods.find((p) => p.type === state.activePeriodType) ?? null;
  });

  readonly elapsedDisplay = computed(() => {
    const period = this.activePeriod();
    const periods = this.clockState()?.periods;
    if (!period || !periods) return null;
    const now = new Date(this.nowTick() + this.offsetMs);
    const seconds = elapsedSecondsInPeriod(period, now);
    return formatMinuteSeconds(periodOffsetSeconds(periods, period.type, now) + seconds);
  });

  /** Cumulative elapsed match seconds "as of now", across all periods played so
   * far — mirrors the backend's `computeLiveElapsedSeconds`. Used to give
   * still-open playing-time segments a live, ticking duration. */
  readonly liveCurrentSecond = computed<number | null>(() => {
    const state = this.clockState();
    if (!state) return null;
    const now = new Date(this.nowTick() + this.offsetMs);
    const period = this.activePeriod();
    if (period) {
      return periodOffsetSeconds(state.periods, period.type, now) + elapsedSecondsInPeriod(period, now);
    }
    // Between periods (e.g. half-time) or match not yet started: sum whatever's played so far.
    const sum = state.periods.reduce((total, p) => total + (p.startedAt ? elapsedSecondsInPeriod(p, now) : 0), 0);
    return sum > 0 ? sum : null;
  });

  /** Total seconds played per player: closed segments count their fixed
   * duration, the one open segment (if on the pitch) ticks live off
   * `liveCurrentSecond`. Mirrors the backend's `segmentDurationSeconds`. */
  private readonly playedSecondsByPlayer = computed<Map<string, number>>(() => {
    const liveSecond = this.liveCurrentSecond();
    const map = new Map<string, number>();
    for (const segment of this.segments()) {
      const duration =
        segment.endSecond !== null
          ? segment.endSecond - segment.startSecond
          : Math.max(0, (liveSecond ?? segment.startSecond) - segment.startSecond);
      map.set(segment.playerId, (map.get(segment.playerId) ?? 0) + duration);
    }
    return map;
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

  /** Players sent off can't be brought back on for the rest of the match —
   * the backend rejects it too, but disabling them here avoids a round
   * trip that's guaranteed to fail. */
  private readonly redCardedPlayerIds = computed(
    () =>
      new Set(
        this.events()
          .filter((e) => e.type === 'red_card' && e.player)
          .map((e) => e.player!.id)
      )
  );

  private readonly roster = computed<RosterRow[]>(() => {
    const match = this.match();
    if (!match) return [];
    const onPitchIds = new Set(
      this.segments()
        .filter((s) => s.endSecond === null)
        .map((s) => s.playerId)
    );
    const statsMap = this.statsByPlayer();
    const redCarded = this.redCardedPlayerIds();
    const playedSeconds = this.playedSecondsByPlayer();
    return match.squad.map((entry) => ({
      playerId: entry.playerId,
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      jerseyNumber: entry.player.jerseyNumber,
      position: entry.player.position,
      isStarter: entry.isStarter,
      onPitch: onPitchIds.has(entry.playerId),
      isRedCarded: redCarded.has(entry.playerId),
      stats: statsMap.get(entry.playerId) ?? EMPTY_STATS,
      playedDisplay: formatMinuteSeconds(playedSeconds.get(entry.playerId) ?? 0),
    }));
  });

  // The member read-only view has no on-pitch/bench tabs — one list,
  // on-pitch players first (still playing, so still the most relevant),
  // matching the approved mockup.
  readonly memberRoster = computed<RosterRow[]>(() => [...this.onPitch(), ...this.bench()]);

  constructor() {
    this.loadAll();

    const tickHandle = setInterval(() => this.nowTick.set(Date.now()), 1000);
    // Backstop, not the primary channel — real-time updates arrive over
    // liveUpdates below; this just covers a missed push during a brief SSE
    // reconnect window.
    const resyncHandle = setInterval(() => {
      this.loadMatch();
      this.loadClock();
    }, 25000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        this.loadMatch();
        this.loadClock();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const liveUpdatesSub = this.liveUpdates.updates$
      .pipe(filter((update) => update.matchId === this.matchId))
      .subscribe(() => this.resync());

    this.destroyRef.onDestroy(() => {
      clearInterval(tickHandle);
      clearInterval(resyncHandle);
      document.removeEventListener('visibilitychange', onVisible);
      liveUpdatesSub.unsubscribe();
    });
  }

  loadAll() {
    this.loading.set(true);
    this.loadError.set(false);
    this.matchesService.get(this.matchId).subscribe({
      next: (res) => {
        this.match.set(res.match);
        this.loadClock();
        this.loadSegments();
        this.loadStats();
        this.loadEvents();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(true);
        this.showActionError(err, 'No se pudo cargar el partido');
      },
    });
  }

  private loadClock() {
    this.clockService.getClock(this.matchId).subscribe({
      next: (state) => {
        this.offsetMs = new Date(state.serverNow).getTime() - Date.now();
        this.clockState.set(state);
        this.syncError.set(false);
      },
      error: () => this.syncError.set(true),
    });
  }

  private loadSegments() {
    this.clockService.listSegments(this.matchId).subscribe({
      next: (res) => {
        this.segments.set(res.segments);
        this.syncError.set(false);
      },
      error: () => this.syncError.set(true),
    });
  }

  private loadEvents() {
    this.matchEventsService.list(this.matchId).subscribe({
      next: (res) => {
        this.events.set(res.events);
        this.syncError.set(false);
      },
      error: () => this.syncError.set(true),
    });
  }

  private loadStats() {
    this.statsService.getMatchStats(this.matchId).subscribe({
      next: (res) => {
        const map = new Map<string, LiveStatCounts>();
        for (const row of res.players) {
          map.set(row.playerId, {
            goals: row.goals,
            assists: row.assists,
            yellowCards: row.yellowCards,
            redCards: row.redCards,
          });
        }
        this.statsByPlayer.set(map);
        this.syncError.set(false);
      },
      error: () => this.syncError.set(true),
    });
  }

  /** Re-fetches the match itself — its score in particular. `loadAll()`
   * fetches this once on entry; after that, the only other place `match`
   * ever changed was the local optimistic patch inside `incrementStat`/
   * `logOpponentGoal`, which only covers the goal *you* just logged. A
   * second viewer (another admin/coach tab, or the same tab reacting to a
   * live-update ping for a goal logged elsewhere) never had this called,
   * so their score just sat stale. */
  private loadMatch() {
    this.matchesService.get(this.matchId).subscribe({
      next: (res) => {
        this.match.set(res.match);
        this.syncError.set(false);
      },
      error: () => this.syncError.set(true),
    });
  }

  /** Manual retry for the persistent sync-error banner — resyncs
   * everything the 25s poll would, on demand. */
  resync() {
    this.loadMatch();
    this.loadClock();
    this.loadSegments();
    this.loadStats();
    this.loadEvents();
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
      error: (err) => {
        this.actionLoading.set(false);
        this.showActionError(err, 'No se pudo iniciar el período');
      },
    });
  }

  private showActionError(err: unknown, fallback: string) {
    const message = (err as { error?: { error?: string } })?.error?.error ?? fallback;
    this.snackBar.open(message, 'Cerrar', { duration: 3000 });
  }

  pause() {
    this.clockService.pause(this.matchId).subscribe({
      next: () => this.loadClock(),
      error: (err) => this.showActionError(err, 'No se pudo pausar el partido'),
    });
  }

  resume() {
    this.clockService.resume(this.matchId).subscribe({
      next: () => this.loadClock(),
      error: (err) => this.showActionError(err, 'No se pudo reanudar el partido'),
    });
  }

  endPeriod() {
    this.clockService.endPeriod(this.matchId).subscribe({
      next: () => this.refreshClockAndSegments(),
      error: (err) => this.showActionError(err, 'No se pudo terminar el período'),
    });
  }

  finishMatch() {
    if (!confirm('¿Finalizar el partido? Se cerrará el tiempo de juego de los jugadores en pista.')) return;
    this.clockService.finish(this.matchId).subscribe({
      next: () => {
        this.snackBar.open('Partido finalizado', 'Cerrar', { duration: 3000 });
        this.router.navigate(['/matches', this.matchId]);
      },
      error: (err) => this.showActionError(err, 'No se pudo finalizar el partido'),
    });
  }

  selectIncoming(playerId: string) {
    if (this.redCardedPlayerIds().has(playerId)) return;
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
        this.loadEvents();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error ?? 'No se pudo realizar el cambio', 'Cerrar', { duration: 3000 });
      },
    });
  }

  incrementStat(event: Event, row: RosterRow, field: StatField) {
    event.stopPropagation();
    const newValue = row.stats[field] + 1;

    const updated = new Map(this.statsByPlayer());
    updated.set(row.playerId, { ...row.stats, [field]: newValue });
    this.statsByPlayer.set(updated);

    this.matchEventsService.log(this.matchId, row.playerId, STAT_EVENT_TYPE_BY_FIELD[field]).subscribe({
      next: (res) => {
        this.events.set([...this.events(), res.event]);
        if (res.match) {
          const current = this.match();
          if (current) this.match.set({ ...current, teamScore: res.match.teamScore });
        }
        // A red card closes the player's playing-time segment server-side
        // and sends them off for the rest of the match — reload segments
        // so they immediately drop off "En el campo".
        if (field === 'redCards') this.loadSegments();
      },
      error: () => {
        this.snackBar.open('No se pudo guardar la estadística', 'Cerrar', { duration: 3000 });
        this.loadStats();
      },
    });
  }

  logOpponentGoal() {
    const match = this.match();
    if (!match) return;

    const previousScore = match.opponentScore;
    this.match.set({ ...match, opponentScore: (previousScore ?? 0) + 1 });

    this.matchEventsService.logOpponentGoal(this.matchId).subscribe({
      next: (res) => {
        this.events.set([...this.events(), res.event]);
        const current = this.match();
        if (current) this.match.set({ ...current, opponentScore: res.match.opponentScore });
      },
      error: () => {
        const current = this.match();
        if (current) this.match.set({ ...current, opponentScore: previousScore });
        this.snackBar.open('No se pudo guardar el gol rival', 'Cerrar', { duration: 3000 });
      },
    });
  }
}
