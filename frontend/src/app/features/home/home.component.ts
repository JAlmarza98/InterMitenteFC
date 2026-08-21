import { Component, DestroyRef, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';
import { Match, MatchesService } from '../../core/services/matches.service';
import { SeasonsService } from '../../core/services/seasons.service';
import { IconComponent } from '../../shared/icon/icon.component';
import {
  ClockState,
  MatchClockService,
  PERIOD_LABELS,
  elapsedSecondsInPeriod,
  formatMinuteSeconds,
  periodOffsetSeconds,
} from '../../core/services/match-clock.service';

interface SeasonSummary {
  matchesPlayed: number;
  goals: number;
  winRate: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, DatePipe, MatButtonModule, IconComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly auth = inject(AuthService);
  private readonly matchesService = inject(MatchesService);
  private readonly seasonsService = inject(SeasonsService);
  private readonly clockService = inject(MatchClockService);
  private readonly destroyRef = inject(DestroyRef);

  readonly matches = signal<Match[]>([]);

  // The hero card's whole reason for existing: whatever needs the most
  // attention right now. A live match always wins; otherwise the soonest
  // scheduled one; otherwise there's nothing to feature and the hero card
  // simply doesn't render (see home.component.html).
  readonly liveMatch = computed(() => this.matches().find((m) => m.status === 'live') ?? null);

  readonly nextMatch = computed(() => {
    const scheduled = this.matches()
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
    return scheduled[0] ?? null;
  });

  // Aggregated client-side from the season's match list rather than a new
  // endpoint — the same data season-stats.component.ts's own aggregate call
  // is built from, just rolled up to the team level instead of per-player.
  readonly seasonSummary = computed<SeasonSummary>(() => {
    const finished = this.matches().filter((m) => m.status === 'finished');
    const matchesPlayed = finished.length;
    const goals = finished.reduce((sum, m) => sum + (m.teamScore ?? 0), 0);
    const wins = finished.filter((m) => (m.teamScore ?? 0) > (m.opponentScore ?? 0)).length;
    const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
    return { matchesPlayed, goals, winRate };
  });

  // Live-match clock — mirrors live-match.component.ts's own clock signals
  // (same clock/period math, same serverNow offset trick) so the hero card
  // shows the real running period and elapsed time instead of a fixed
  // placeholder. Kept deliberately lighter than the full live tracker: no
  // segments/roster/events here, just the clock the hero card needs.
  private offsetMs = 0;
  private readonly nowTick = signal(Date.now());
  readonly clockState = signal<ClockState | null>(null);

  private readonly activePeriod = computed(() => {
    const state = this.clockState();
    if (!state?.activePeriodType) return null;
    return state.periods.find((p) => p.type === state.activePeriodType) ?? null;
  });

  readonly periodLabel = computed(() => {
    const type = this.clockState()?.activePeriodType;
    return type ? PERIOD_LABELS[type] : null;
  });

  readonly elapsedDisplay = computed(() => {
    const state = this.clockState();
    const period = this.activePeriod();
    const now = new Date(this.nowTick() + this.offsetMs);
    if (period && state) {
      const seconds = elapsedSecondsInPeriod(period, now);
      return formatMinuteSeconds(periodOffsetSeconds(state.periods, period.type, now) + seconds);
    }
    // Between periods (half-time) or not yet started: show whatever's
    // accumulated across periods played so far rather than nothing.
    const played = state?.periods.filter((p) => p.startedAt) ?? [];
    if (played.length === 0) return null;
    const total = played.reduce((sum, p) => sum + elapsedSecondsInPeriod(p, now), 0);
    return formatMinuteSeconds(total);
  });

  constructor() {
    this.seasonsService.list().subscribe((res) => {
      const active = res.seasons.find((s) => s.isActive) ?? res.seasons[0];
      if (!active) return;
      this.matchesService.list(active.id).subscribe((matchesRes) => {
        this.matches.set(matchesRes.matches);
      });
    });

    let tickHandle: ReturnType<typeof setInterval> | null = null;
    let resyncHandle: ReturnType<typeof setInterval> | null = null;
    let lastLiveMatchId: string | null = null;

    effect(() => {
      const match = this.liveMatch();
      if (match?.id === lastLiveMatchId) return;
      lastLiveMatchId = match?.id ?? null;

      if (tickHandle) clearInterval(tickHandle);
      if (resyncHandle) clearInterval(resyncHandle);
      tickHandle = null;
      resyncHandle = null;
      this.clockState.set(null);

      if (!match) return;

      const loadClock = () => {
        this.clockService.getClock(match.id).subscribe((state) => {
          this.offsetMs = new Date(state.serverNow).getTime() - Date.now();
          this.clockState.set(state);
        });
      };
      loadClock();
      tickHandle = setInterval(() => this.nowTick.set(Date.now()), 1000);
      resyncHandle = setInterval(loadClock, 25000);
    });

    this.destroyRef.onDestroy(() => {
      if (tickHandle) clearInterval(tickHandle);
      if (resyncHandle) clearInterval(resyncHandle);
    });
  }
}
