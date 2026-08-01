import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';

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

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  getMatchStats(matchId: string) {
    return this.http.get<{ players: MatchPlayerStatRow[] }>(`/api/matches/${matchId}/stats`);
  }

  upsertPlayerStat(matchId: string, playerId: string, input: PlayerStatInput) {
    return this.http.put<{ stat: unknown }>(`/api/matches/${matchId}/player-stats/${playerId}`, input);
  }
}
