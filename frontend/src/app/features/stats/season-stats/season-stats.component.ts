import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  formatRating,
  ratingTier,
  SeasonStatRow,
  SeasonStats,
  StatsService,
} from '../../../core/services/stats.service';
import { Season, SeasonsService } from '../../../core/services/seasons.service';
import { formatMinuteSeconds } from '../../../core/services/match-clock.service';
import { IconComponent } from '../../../shared/icon/icon.component';

type SortColumn = 'name' | 'avgRating' | 'appearances' | 'timePlayed' | 'avgTime' | 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'ownGoals';

@Component({
  selector: 'app-season-stats',
  standalone: true,
  imports: [MatMenuModule, MatProgressSpinnerModule, IconComponent],
  templateUrl: './season-stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './season-stats.component.scss',
})
export class SeasonStatsComponent {
  private readonly seasonsService = inject(SeasonsService);
  private readonly statsService = inject(StatsService);

  formatTime(totalSeconds: number): string {
    return formatMinuteSeconds(totalSeconds);
  }

  readonly formatRating = formatRating;
  readonly ratingTier = ratingTier;

  readonly seasons = signal<Season[]>([]);
  readonly selectedSeasonId = signal<string | null>(null);
  readonly stats = signal<SeasonStats | null>(null);
  readonly loadingSeasons = signal(true);
  readonly loadingStats = signal(false);

  readonly selectedSeason = computed(() => this.seasons().find((s) => s.id === this.selectedSeasonId()) ?? null);

  // A stats table's whole job is letting you rank players, so it opens
  // already sorted by the stat people check first (average rating)
  // instead of whatever order the API happened to return. Only the
  // tablet table exposes a way to change it — the mockup's mobile
  // leaderboard has no sort control of its own, so mobile always
  // reflects this default.
  readonly sort = signal<{ active: SortColumn; direction: 'asc' | 'desc' }>({ active: 'avgRating', direction: 'desc' });

  toggleSort(column: SortColumn) {
    const current = this.sort();
    if (current.active === column) {
      this.sort.set({ active: column, direction: current.direction === 'desc' ? 'asc' : 'desc' });
    } else {
      this.sort.set({ active: column, direction: 'desc' });
    }
  }

  readonly sortedPlayers = computed<SeasonStatRow[]>(() => {
    const players = this.stats()?.players ?? [];
    const { active, direction } = this.sort();
    const factor = direction === 'asc' ? 1 : -1;
    return [...players].sort((a, b) => {
      const va = this.sortValue(a, active);
      const vb = this.sortValue(b, active);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  });

  // Each leaderboard column the mockup actually highlights gets its own
  // leader set (a tie — two players tied for most goals, say — marks
  // everyone at the max, not just whoever the API listed first).
  // Appearances/cards/own-goals aren't marked in the mockup (no player in
  // its example data gets a badge for them even when tied), so they stay
  // plain numbers here too.
  private makeLeaderIds(select: (row: SeasonStatRow) => number) {
    return computed(() => {
      const players = this.stats()?.players ?? [];
      const max = Math.max(0, ...players.map(select));
      if (max === 0) return new Set<string>();
      return new Set(players.filter((row) => select(row) === max).map((row) => row.playerId));
    });
  }

  // Rating's "no data" sentinel is `null` (a player with no appearances
  // has no rating), not `0` like every other counter here — `makeLeaderIds`
  // treats an all-zero column as "nobody leads it", which doesn't apply to
  // a rating centered around a 5.0 baseline, so this can't reuse that
  // helper as-is.
  readonly topRatingIds = computed(() => {
    const players = this.stats()?.players ?? [];
    const rated = players.filter((r) => r.avgRating !== null);
    if (rated.length === 0) return new Set<string>();
    const max = Math.max(...rated.map((r) => r.avgRating!));
    return new Set(rated.filter((r) => r.avgRating === max).map((r) => r.playerId));
  });

  readonly topScorerIds = this.makeLeaderIds((r) => r.goals);
  readonly topAssistsIds = this.makeLeaderIds((r) => r.assists);
  readonly topTimePlayedIds = this.makeLeaderIds((r) => r.secondsPlayed);

  constructor() {
    this.loadingSeasons.set(true);
    this.seasonsService.list().subscribe((res) => {
      this.seasons.set(res.seasons);
      this.loadingSeasons.set(false);
      const active = res.seasons.find((s) => s.isActive) ?? res.seasons[0];
      if (active) this.selectSeason(active.id);
    });
  }

  selectSeason(seasonId: string) {
    this.selectedSeasonId.set(seasonId);
    this.loadingStats.set(true);
    this.statsService.getSeasonStats(seasonId).subscribe({
      next: (res) => {
        this.stats.set(res);
        this.loadingStats.set(false);
      },
      error: () => this.loadingStats.set(false),
    });
  }

  private sortValue(row: SeasonStatRow, column: SortColumn): string | number {
    switch (column) {
      case 'name':
        return `${row.player.firstName} ${row.player.lastName}`;
      case 'appearances':
        return row.appearances;
      case 'timePlayed':
        return row.secondsPlayed;
      case 'avgTime':
        return row.avgSecondsPerAppearance;
      case 'avgRating':
        return row.avgRating ?? -1;
      case 'goals':
        return row.goals;
      case 'assists':
        return row.assists;
      case 'yellowCards':
        return row.yellowCards;
      case 'redCards':
        return row.redCards;
      case 'ownGoals':
        return row.ownGoals;
    }
  }
}
