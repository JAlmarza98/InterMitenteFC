import { MatchFormation, MatchWithSquad } from '../../../core/services/matches.service';
import { FormationPreset } from './formation-presets';

const GROUP_EMOJI: Record<string, string> = {
  portero: '🟡',
  defensa: '🔵',
  medio: '🟢',
  delantero: '🔴',
};

const GROUP_TITLE: Record<string, string> = {
  portero: 'Portero',
  defensa: 'Defensa',
  medio: 'Medio',
  delantero: 'Delantero',
};

function playerLabel(player: { firstName: string; lastName: string; jerseyNumber: number | null }): string {
  const name = `${player.firstName} ${player.lastName}`;
  return player.jerseyNumber !== null ? `${name} (#${player.jerseyNumber})` : name;
}

function formatMatchDate(matchDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(matchDate));
}

/** Builds the Spanish callup text (the paso 4 textarea's initial value) from
 * the match, the chosen formation preset and the saved slot assignments. */
export function buildCallupMessage(
  match: MatchWithSquad,
  preset: FormationPreset,
  formation: MatchFormation
): string {
  const slotsByKey = new Map(formation.slots.map((s) => [s.slotKey, s]));
  const groups: Record<string, FormationPreset['slots']> = { portero: [], defensa: [], medio: [], delantero: [] };
  for (const slotDef of preset.slots) groups[slotDef.colorGroup].push(slotDef);

  const lines: string[] = [];
  const dateLabel = formatMatchDate(match.matchDate);
  const competitionLabel = match.competition ? ` · ${match.competition}` : '';

  lines.push(`⚽ *CONVOCATORIA* — Inter Mitente vs ${match.opponent}`);
  lines.push(`📅 ${dateLabel}${competitionLabel}`);

  const allSubIds = new Set<string>();

  for (const colorGroup of ['portero', 'defensa', 'medio', 'delantero'] as const) {
    const slotDefs = groups[colorGroup];
    if (slotDefs.length === 0) continue;

    lines.push('');
    lines.push(`${GROUP_EMOJI[colorGroup]} *${GROUP_TITLE[colorGroup]}*`);

    const singleSlotInGroup = slotDefs.length === 1;
    for (const slotDef of slotDefs) {
      const slot = slotsByKey.get(slotDef.key);
      if (!slot) continue;

      const starterLine = singleSlotInGroup
        ? `*${playerLabel(slot.player)}*`
        : `${slotDef.label}: *${playerLabel(slot.player)}*`;
      lines.push(starterLine);

      if (slot.substitutes.length > 0) {
        const subLabels = slot.substitutes.map((s) => playerLabel(s.player));
        const word = subLabels.length === 1 ? 'cambio' : 'cambios';
        lines.push(`   ${word}: ${subLabels.join(', ')}`);
        for (const s of slot.substitutes) allSubIds.add(s.playerId);
      }
    }
  }

  if (allSubIds.size > 0) {
    const allSubs = formation.slots
      .flatMap((s) => s.substitutes)
      .filter((s, i, arr) => arr.findIndex((o) => o.playerId === s.playerId) === i)
      .map((s) => playerLabel(s.player));
    lines.push('');
    lines.push('🪑 *Banquillo*');
    for (const sub of allSubs) lines.push(sub);
  }

  lines.push('');
  lines.push('¡Vamos equipo! 💪');

  return lines.join('\n');
}
