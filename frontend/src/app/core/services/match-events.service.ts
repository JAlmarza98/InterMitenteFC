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
  | 'opponent_goal'
  | 'penalty_goal'
  | 'penalty_won'
  | 'period_start'
  | 'period_end';
/** Only the clock itself logs substitutions and period start/end. */
export type LoggableEventType = Exclude<MatchEventType, 'substitution' | 'period_start' | 'period_end'>;

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
  penalty_goal: 'Gol de penalti',
  penalty_won: 'Penalti provocado',
  period_start: 'Inicio de periodo',
  period_end: 'Fin de periodo',
};

// Material icon ligature names (not emoji — see craft-floor's ban on
// emoji standing in for an icon system). `event-icon-<type>` in the
// shared stylesheet supplies the semantic color (card yellow/red, etc.);
// this map only chooses the glyph.
export const MATCH_EVENT_ICONS: Record<MatchEventType, string> = {
  goal: 'sports_soccer',
  assist: 'handshake',
  yellow_card: 'crop_portrait',
  red_card: 'crop_portrait',
  own_goal: 'sports_soccer',
  substitution: 'swap_horiz',
  opponent_goal: 'sports_soccer',
  penalty_goal: 'sports_soccer',
  penalty_won: 'sports',
  period_start: 'schedule',
  period_end: 'schedule',
};

// Spelled out rather than PERIOD_LABELS' short "Prórroga 1", which reads
// oddly mid-sentence ("Empieza la Prórroga 1").
const PERIOD_PHRASES: Record<PeriodType, string> = {
  first_half: 'la 1ª parte',
  second_half: 'la 2ª parte',
  extra_first: 'la 1ª parte de la prórroga',
  extra_second: 'la 2ª parte de la prórroga',
};

/** "Empieza la 2ª parte" / "Termina la 1ª parte de la prórroga" for a
 * period start/end event, `null` for any other event type. Shared by the
 * live-match and match-detail histories. */
export function periodEventDescription(event: MatchEvent): string | null {
  if (event.type === 'period_start') return `Empieza ${PERIOD_PHRASES[event.periodType]}`;
  if (event.type === 'period_end') return `Termina ${PERIOD_PHRASES[event.periodType]}`;
  return null;
}

@Injectable({ providedIn: 'root' })
export class MatchEventsService {
  private readonly http = inject(HttpClient);

  list(matchId: string) {
    return this.http.get<{ events: MatchEvent[] }>(`/api/matches/${matchId}/events`);
  }

  log(matchId: string, playerId: string, type: Exclude<LoggableEventType, 'opponent_goal'>) {
    return this.http.post<{ stat: unknown; event: MatchEvent; match: Match | null }>(`/api/matches/${matchId}/events`, {
      playerId,
      type,
    });
  }

  logOpponentGoal(matchId: string) {
    return this.http.post<{ match: { opponentScore: number | null }; event: MatchEvent }>(
      `/api/matches/${matchId}/events`,
      { type: 'opponent_goal' }
    );
  }
}
