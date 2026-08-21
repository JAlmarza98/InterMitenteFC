import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface MatchUpdate {
  matchId: string;
  at: string;
}

/** One app-wide SSE connection to `/api/live-updates` (see AppComponent,
 * which connects once a user is logged in and disconnects on logout).
 * Any screen showing live match state subscribes to `updates$` and calls
 * its own existing refetch method in response — this service only carries
 * the "something about this match changed" signal, never the data itself,
 * so there's no DTO shape to keep in sync with the REST endpoints. */
@Injectable({ providedIn: 'root' })
export class LiveUpdatesService {
  private readonly _updates = new Subject<MatchUpdate>();
  readonly updates$ = this._updates.asObservable();

  private eventSource: EventSource | null = null;

  connect(): void {
    if (this.eventSource) return;
    // EventSource can't send custom headers — auth rides on the session
    // cookie, which withCredentials is required for on a cross-origin
    // request (the Angular dev-server proxy and prod's nginx both make
    // this same-origin in practice, but the flag is harmless either way).
    this.eventSource = new EventSource('/api/live-updates', { withCredentials: true });
    this.eventSource.onmessage = (event) => {
      this._updates.next(JSON.parse(event.data));
    };
    // No onerror handling beyond this: EventSource reconnects on its own
    // after a connection drop (with the browser's built-in backoff), so
    // there's nothing for us to do here beyond letting it retry.
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
