import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SeasonStatRow, SeasonStats, StatsService } from '../../../core/services/stats.service';
import { Season, SeasonsService } from '../../../core/services/seasons.service';
import { formatMinuteSeconds } from '../../../core/services/match-clock.service';

@Component({
  selector: 'app-season-stats',
  standalone: true,
  imports: [
    MatCardModule,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './season-stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './season-stats.component.scss',
})
export class SeasonStatsComponent {
  private readonly seasonsService = inject(SeasonsService);
  private readonly statsService = inject(StatsService);

  readonly columns = [
    'name',
    'appearances',
    'timePlayed',
    'avgTime',
    'goals',
    'assists',
    'yellowCards',
    'redCards',
    'ownGoals',
  ];

  formatTime(totalSeconds: number): string {
    return formatMinuteSeconds(totalSeconds);
  }

  readonly seasons = signal<Season[]>([]);
  readonly selectedSeasonId = signal<string | null>(null);
  readonly stats = signal<SeasonStats | null>(null);
  readonly loadingSeasons = signal(true);
  readonly loadingStats = signal(false);

  // A stats table's whole job is letting you rank players, so it opens
  // already sorted by the stat people check first (goals) instead of
  // whatever order the API happened to return.
  readonly sort = signal<Sort>({ active: 'goals', direction: 'desc' });

  readonly sortedPlayers = computed<SeasonStatRow[]>(() => {
    const players = this.stats()?.players ?? [];
    const { active, direction } = this.sort();
    if (!direction) return players;
    const factor = direction === 'asc' ? 1 : -1;
    return [...players].sort((a, b) => {
      const va = this.sortValue(a, active);
      const vb = this.sortValue(b, active);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  });

  // Each stat column gets its own leader(s), highlighted regardless of
  // the current sort — so switching the table to "sort by cards" doesn't
  // hide who's actually leading in goals, and vice versa. A tie is
  // common in a small squad (two players on one red card, say), so every
  // player at the max value is marked, not just whoever the API listed
  // first — a set of ids rather than a single one. avgTime is
  // deliberately excluded: it's a ratio, not something a player racks
  // up, and "leading" it can just mean one good appearance.
  private makeLeaderIds(select: (row: SeasonStatRow) => number) {
    return computed(() => {
      const players = this.stats()?.players ?? [];
      const max = Math.max(0, ...players.map(select));
      if (max === 0) return new Set<string>();
      return new Set(players.filter((row) => select(row) === max).map((row) => row.playerId));
    });
  }

  readonly topScorerIds = this.makeLeaderIds((r) => r.goals);
  readonly topAppearancesIds = this.makeLeaderIds((r) => r.appearances);
  readonly topTimePlayedIds = this.makeLeaderIds((r) => r.secondsPlayed);
  readonly topAssistsIds = this.makeLeaderIds((r) => r.assists);
  readonly topYellowCardsIds = this.makeLeaderIds((r) => r.yellowCards);
  readonly topRedCardsIds = this.makeLeaderIds((r) => r.redCards);
  readonly topOwnGoalsIds = this.makeLeaderIds((r) => r.ownGoals);

  onSortChange(sort: Sort) {
    this.sort.set(sort);
  }

  private sortValue(row: SeasonStatRow, column: string): string | number {
    switch (column) {
      case 'name':
        return `${row.player.firstName} ${row.player.lastName}`;
      case 'appearances':
        return row.appearances;
      case 'timePlayed':
        return row.secondsPlayed;
      case 'avgTime':
        return row.avgSecondsPerAppearance;
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
      default:
        return 0;
    }
  }

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
}
