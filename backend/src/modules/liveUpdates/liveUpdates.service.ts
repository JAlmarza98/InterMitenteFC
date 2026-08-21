import { EventEmitter } from "node:events";

// In-memory pub/sub for match-state changes, broadcast to every connected
// SSE client (see liveUpdates.routes.ts). This is deliberately a single
// process-local EventEmitter, not something like Redis pub/sub — the app
// runs as one Node process / one container replica (see server.ts,
// docker-compose.yml), so there's nothing to fan this out across yet. If
// the deployment ever grows to multiple replicas, this broadcaster would
// need to move to a shared channel (Redis, Postgres LISTEN/NOTIFY, etc.)
// so updates from one replica reach clients connected to another.
const emitter = new EventEmitter();
// Every match on the club can be live at once in theory, and every viewer
// listens on the same channel — raise the default (10) so a bigger roster
// of concurrent viewers doesn't trigger Node's MaxListenersExceededWarning.
emitter.setMaxListeners(1000);

const UPDATE_EVENT = "match-update";

export interface MatchUpdatePayload {
  matchId: string;
  at: string;
}

/** Call after any successful mutation to a match's live state (clock,
 * segments, events, score) so every connected viewer knows to refetch. */
export function broadcastMatchUpdate(matchId: string): void {
  const payload: MatchUpdatePayload = { matchId, at: new Date().toISOString() };
  emitter.emit(UPDATE_EVENT, payload);
}

export function onMatchUpdate(listener: (payload: MatchUpdatePayload) => void): () => void {
  emitter.on(UPDATE_EVENT, listener);
  return () => emitter.off(UPDATE_EVENT, listener);
}
