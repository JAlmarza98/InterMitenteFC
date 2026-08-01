import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';
import { Season } from './seasons.service';

export interface MatchPlayerStatRow {
  playerId: string;
  player: Player;
  isStarter: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
}

export interface PlayerStatInput {
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
}

export interface SeasonStatRow {
  playerId: string;
  player: Player;
  appearances: number;
  minutesPlayed: number;
  avgMinutesPerAppearance: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
}

export interface SeasonStats {
  season: Season;
  matchesPlayed: number;
  players: SeasonStatRow[];
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  getMatchStats(matchId: string) {
    return this.http.get<{ players: MatchPlayerStatRow[] }>(`/api/matches/${matchId}/stats`);
  }

  upsertPlayerStat(matchId: string, playerId: string, input: PlayerStatInput) {
    return this.http.put<{ stat: unknown }>(`/api/matches/${matchId}/player-stats/${playerId}`, input);
  }

  getSeasonStats(seasonId: string) {
    return this.http.get<SeasonStats>(`/api/stats/season/${seasonId}`);
  }
}
