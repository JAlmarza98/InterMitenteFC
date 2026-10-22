import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';

export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type HomeAway = 'home' | 'away';

export interface Match {
  id: string;
  seasonId: string | null;
  opponent: string;
  matchDate: string;
  homeAway: HomeAway;
  competition: string | null;
  teamScore: number | null;
  opponentScore: number | null;
  notes: string | null;
  status: MatchStatus;
  periodLengthMinutes: number;
}

export interface MatchSquadEntry {
  id: string;
  matchId: string;
  playerId: string;
  isStarter: boolean;
  player: Player;
}

export interface MatchWithSquad extends Match {
  squad: MatchSquadEntry[];
}

export interface MatchFormationSubEntry {
  id: string;
  playerId: string;
  player: Player;
}

export interface MatchFormationSlotEntry {
  id: string;
  slotKey: string;
  playerId: string;
  player: Player;
  substitutes: MatchFormationSubEntry[];
}

export interface MatchFormation {
  id: string;
  matchId: string;
  presetId: string;
  slots: MatchFormationSlotEntry[];
}

export interface FormationSlotInput {
  slotKey: string;
  playerId: string;
  subPlayerIds: string[];
}

export interface MatchInput {
  seasonId?: string | null;
  opponent: string;
  matchDate: string;
  homeAway: HomeAway;
  competition?: string | null;
  notes?: string | null;
  periodLengthMinutes?: number;
}

export const COMPETITIONS: string[] = ['Liga', 'Copa'];

@Injectable({ providedIn: 'root' })
export class MatchesService {
  private readonly http = inject(HttpClient);

  list(seasonId?: string) {
    const params: Record<string, string> = seasonId ? { seasonId } : {};
    return this.http.get<{ matches: Match[] }>('/api/matches', { params });
  }

  get(id: string) {
    return this.http.get<{ match: MatchWithSquad }>(`/api/matches/${id}`);
  }

  create(input: MatchInput) {
    return this.http.post<{ match: Match }>('/api/matches', input);
  }

  update(
    id: string,
    input: Partial<MatchInput> & {
      status?: MatchStatus;
      teamScore?: number | null;
      opponentScore?: number | null;
    }
  ) {
    return this.http.patch<{ match: Match }>(`/api/matches/${id}`, input);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/matches/${id}`);
  }

  setSquad(id: string, players: { playerId: string; isStarter: boolean }[]) {
    return this.http.put<{ squad: MatchSquadEntry[] }>(`/api/matches/${id}/squad`, { players });
  }

  /** Admin only: the match's top 3, best first. */
  getTopPlayers(id: string) {
    return this.http.get<{ playerIds: string[] }>(`/api/matches/${id}/top-players`);
  }

  setTopPlayers(id: string, playerIds: string[]) {
    return this.http.put<{ playerIds: string[] }>(`/api/matches/${id}/top-players`, { playerIds });
  }

  getFormation(id: string) {
    return this.http.get<{ formation: MatchFormation | null }>(`/api/matches/${id}/formation`);
  }

  setFormation(id: string, presetId: string, slots: FormationSlotInput[]) {
    return this.http.put<{ formation: MatchFormation }>(`/api/matches/${id}/formation`, { presetId, slots });
  }
}
