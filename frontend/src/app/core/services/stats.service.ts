import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';
import { Season } from './seasons.service';

export interface MatchPlayerStatRow {
  playerId: string;
  player: Player;
  isStarter: boolean;
  secondsPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  rating: number | null;
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
  secondsPlayed: number;
  avgSecondsPerAppearance: number;
  avgRating: number | null;
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

/** Formats a rating for display — 1 decimal, or an em dash for a player
 * with no rating (didn't play). Shared by every screen that shows a
 * `rating`/`avgRating` value so they read identically. */
export function formatRating(rating: number | null): string {
  return rating !== null ? rating.toFixed(1) : '—';
}

export type RatingTier = 'none' | 'poor' | 'average' | 'good' | 'excellent';

/** Buckets a rating into a tier for the `.rating-badge`/`.rating-<tier>`
 * classes in `styles.scss` — a plain number is easy to skim past in a
 * dense stats table, a colored badge isn't. Thresholds are centered on
 * the formula's own 5.0 baseline (see `playerRating.ts` on the backend):
 * a quiet game with nothing notable reads as "average", not "poor". */
export function ratingTier(rating: number | null): RatingTier {
  if (rating === null) return 'none';
  if (rating < 4.5) return 'poor';
  if (rating < 6.5) return 'average';
  if (rating < 8) return 'good';
  return 'excellent';
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
