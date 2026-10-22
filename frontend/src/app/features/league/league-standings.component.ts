import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LeagueService, Standings } from '../../core/services/league.service';

@Component({
  selector: 'app-league-standings',
  standalone: true,
  imports: [DatePipe, MatProgressSpinnerModule],
  templateUrl: './league-standings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './league-standings.component.scss',
})
export class LeagueStandingsComponent {
  readonly standings = signal<Standings | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    inject(LeagueService)
      .standings()
      .subscribe({
        next: (s) => {
          this.standings.set(s);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }
}
