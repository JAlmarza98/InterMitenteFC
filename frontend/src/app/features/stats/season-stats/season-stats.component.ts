import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SeasonStats, StatsService } from '../../../core/services/stats.service';
import { Season, SeasonsService } from '../../../core/services/seasons.service';

@Component({
  selector: 'app-season-stats',
  standalone: true,
  imports: [
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './season-stats.component.html',
  styleUrl: './season-stats.component.scss',
})
export class SeasonStatsComponent {
  private readonly seasonsService = inject(SeasonsService);
  private readonly statsService = inject(StatsService);

  readonly columns = [
    'name',
    'appearances',
    'minutesPlayed',
    'avgMinutes',
    'goals',
    'assists',
    'yellowCards',
    'redCards',
    'ownGoals',
  ];

  readonly seasons = signal<Season[]>([]);
  readonly selectedSeasonId = signal<string | null>(null);
  readonly stats = signal<SeasonStats | null>(null);
  readonly loadingSeasons = signal(true);
  readonly loadingStats = signal(false);

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
