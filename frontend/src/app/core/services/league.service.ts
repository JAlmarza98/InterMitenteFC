import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface StandingRow {
  position: number;
  team: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  isOurTeam: boolean;
}

export interface Standings {
  division: string;
  fetchedAt: string;
  rows: StandingRow[];
}

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private readonly http = inject(HttpClient);

  standings() {
    return this.http.get<Standings>('/api/league/standings');
  }
}
