import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Player } from './players.service';

export type PeriodType = 'first_half' | 'second_half' | 'extra_first' | 'extra_second';

export interface ClockPause {
  pausedAt: string;
  resumedAt: string | null;
}

export interface ClockPeriod {
  type: PeriodType;
  startedAt: string | null;
  endedAt: string | null;
  pauses: ClockPause[];
}

export interface ClockState {
  serverNow: string;
  periods: ClockPeriod[];
  activePeriodType: PeriodType | null;
  isPaused: boolean;
  currentMinute: number | null;
}

export interface Segment {
  id: string;
  matchId: string;
  playerId: string;
  periodType: PeriodType;
  startMinute: number;
  endMinute: number | null;
  startedAt: string | null;
  endedAt: string | null;
  source: 'live' | 'manual';
  player: Player;
}

export interface ManualSegmentInput {
  playerId: string;
  periodType: PeriodType;
  startMinute: number;
  endMinute: number | null;
}

export const PERIOD_LABELS: Record<PeriodType, string> = {
  first_half: '1ª parte',
  second_half: '2ª parte',
  extra_first: 'Prórroga 1',
  extra_second: 'Prórroga 2',
};

export const PERIOD_ORDER: PeriodType[] = ['first_half', 'second_half', 'extra_first', 'extra_second'];

export const PERIOD_OFFSET_MINUTES: Record<PeriodType, number> = {
  first_half: 0,
  second_half: 45,
  extra_first: 90,
  extra_second: 105,
};

@Injectable({ providedIn: 'root' })
export class MatchClockService {
  private readonly http = inject(HttpClient);

  getClock(matchId: string) {
    return this.http.get<ClockState>(`/api/matches/${matchId}/clock`);
  }

  startPeriod(matchId: string, type: PeriodType) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/clock/start-period`, { type });
  }

  pause(matchId: string) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/clock/pause`, {});
  }

  resume(matchId: string) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/clock/resume`, {});
  }

  endPeriod(matchId: string) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/clock/end-period`, {});
  }

  finish(matchId: string) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/clock/finish`, {});
  }

  substitute(matchId: string, playerOutId: string, playerInId: string) {
    return this.http.post<ClockState>(`/api/matches/${matchId}/substitutions`, { playerOutId, playerInId });
  }

  listSegments(matchId: string) {
    return this.http.get<{ segments: Segment[] }>(`/api/matches/${matchId}/segments`);
  }

  createSegment(matchId: string, input: ManualSegmentInput) {
    return this.http.post<{ segment: Segment }>(`/api/matches/${matchId}/segments`, input);
  }

  updateSegment(matchId: string, segmentId: string, input: Partial<ManualSegmentInput>) {
    return this.http.patch<{ segment: Segment }>(`/api/matches/${matchId}/segments/${segmentId}`, input);
  }

  deleteSegment(matchId: string, segmentId: string) {
    return this.http.delete<void>(`/api/matches/${matchId}/segments/${segmentId}`);
  }
}

/** Elapsed seconds within a period at instant `now`, excluding paused time. Mirrors the backend formula. */
export function elapsedSecondsInPeriod(period: ClockPeriod, now: Date): number {
  if (!period.startedAt) return 0;
  const end = period.endedAt ? new Date(period.endedAt) : now;
  let elapsedMs = end.getTime() - new Date(period.startedAt).getTime();
  for (const pause of period.pauses) {
    const pauseEnd = pause.resumedAt ? new Date(pause.resumedAt) : now;
    elapsedMs -= pauseEnd.getTime() - new Date(pause.pausedAt).getTime();
  }
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

export function formatMinuteSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
