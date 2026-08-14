import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';
import { PeriodType } from './match-clock.service';
import { Match } from './matches.service';

export type MatchEventType =
  | 'goal'
  | 'assist'
  | 'yellow_card'
  | 'red_card'
  | 'own_goal'
  | 'substitution'
  | 'opponent_goal';
export type LoggableEventType = Exclude<MatchEventType, 'substitution'>;

export interface MatchEvent {
  id: string;
  matchId: string;
  type: MatchEventType;
  periodType: PeriodType;
  second: number;
  player: Player | null;
  relatedPlayer: Player | null;
  createdAt: string;
}

export const MATCH_EVENT_LABELS: Record<MatchEventType, string> = {
  goal: 'Gol',
  assist: 'Asistencia',
  yellow_card: 'Tarjeta amarilla',
  red_card: 'Tarjeta roja',
  own_goal: 'Gol en propia',
  substitution: 'Cambio',
  opponent_goal: 'Gol rival',
};

export const MATCH_EVENT_ICONS: Record<MatchEventType, string> = {
  goal: '⚽',
  assist: '🅰️',
  yellow_card: '🟨',
  red_card: '🟥',
  own_goal: '⚽',
  substitution: '🔄',
  opponent_goal: '🥅',
};

@Injectable({ providedIn: 'root' })
export class MatchEventsService {
  private readonly http = inject(HttpClient);

  list(matchId: string) {
    return this.http.get<{ events: MatchEvent[] }>(`/api/matches/${matchId}/events`);
  }

  log(matchId: string, playerId: string, type: Exclude<LoggableEventType, 'opponent_goal'>) {
    return this.http.post<{ stat: unknown; event: MatchEvent; match: Match | null }>(
      `/api/matches/${matchId}/events`,
      { playerId, type }
    );
  }

  logOpponentGoal(matchId: string) {
    return this.http.post<{ match: { opponentScore: number | null }; event: MatchEvent }>(
      `/api/matches/${matchId}/events`,
      { type: 'opponent_goal' }
    );
  }
}
