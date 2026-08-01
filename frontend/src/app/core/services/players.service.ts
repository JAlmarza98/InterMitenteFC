import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
  birthDate: string | null;
  active: boolean;
}

export interface PlayerInput {
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlayersService {
  private readonly http = inject(HttpClient);

  list(includeInactive = false) {
    const params: Record<string, string> = includeInactive ? { includeInactive: 'true' } : {};
    return this.http.get<{ players: Player[] }>('/api/players', { params });
  }

  create(input: PlayerInput) {
    return this.http.post<{ player: Player }>('/api/players', input);
  }

  update(id: string, input: Partial<PlayerInput> & { active?: boolean }) {
    return this.http.patch<{ player: Player }>(`/api/players/${id}`, input);
  }
}
