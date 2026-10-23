import { FormationSlotDef } from '../matches/formation/formation-presets';

export interface PlacedPlayer {
  slot: FormationSlotDef;
  playerId: string;
}

/** Who stands in which formation slot right now. Starts from the planned
 * starters, hands each slot over on every substitution (in chronological
 * order), then drops anyone who is no longer on the pitch (red card) and
 * puts any on-pitch player still without a slot (no plan, or the real
 * line-up differed from it) into the first free slot. */
export function placePlayers(
  slots: FormationSlotDef[],
  plannedStarters: Map<string, string>,
  substitutions: { inId: string; outId: string }[],
  onPitchIds: string[]
): PlacedPlayer[] {
  const occupant = new Map(plannedStarters);
  for (const { inId, outId } of substitutions) {
    for (const [slotKey, playerId] of occupant) {
      if (playerId === outId) occupant.set(slotKey, inId);
    }
  }

  const onPitch = new Set(onPitchIds);
  const placed = new Map<string, string>();
  for (const slot of slots) {
    const playerId = occupant.get(slot.key);
    if (playerId && onPitch.has(playerId) && ![...placed.values()].includes(playerId)) placed.set(slot.key, playerId);
  }
  // ponytail: a player beyond the 7 slots (shouldn't happen in fútbol 7) is not drawn; add an overflow row if it ever does.
  const unplaced = onPitchIds.filter((id) => ![...placed.values()].includes(id));
  for (const slot of slots) {
    if (!placed.has(slot.key) && unplaced.length) placed.set(slot.key, unplaced.shift()!);
  }

  return slots.filter((slot) => placed.has(slot.key)).map((slot) => ({ slot, playerId: placed.get(slot.key)! }));
}

/** First name for the shirt, trimmed (the roster has stray spaces); the last
 * name when there is no first name; and the last-name initial when two
 * players share a first name ("Iván C.", "Iván T."). */
export function shortNames(players: { id: string; firstName: string; lastName: string }[]): Map<string, string> {
  const first = (p: { firstName: string; lastName: string }) => p.firstName.trim() || p.lastName.trim();
  const counts = new Map<string, number>();
  for (const p of players) counts.set(first(p), (counts.get(first(p)) ?? 0) + 1);
  return new Map(
    players.map((p) => {
      const name = first(p);
      const initial = p.firstName.trim() && p.lastName.trim() ? p.lastName.trim()[0] : '';
      return [p.id, counts.get(name)! > 1 && initial ? `${name} ${initial}.` : name];
    })
  );
}
