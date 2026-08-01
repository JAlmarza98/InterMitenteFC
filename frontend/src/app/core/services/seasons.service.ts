import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface SeasonInput {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeasonsService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<{ seasons: Season[] }>('/api/seasons');
  }

  create(input: SeasonInput) {
    return this.http.post<{ season: Season }>('/api/seasons', input);
  }

  update(id: string, input: Partial<SeasonInput>) {
    return this.http.patch<{ season: Season }>(`/api/seasons/${id}`, input);
  }
}
