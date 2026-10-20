import { MatchFormation, MatchWithSquad } from '../../../core/services/matches.service';
import { buildCallupMessage } from './callup-message';
import { FORMATION_PRESETS } from './formation-presets';

function player(id: string, firstName: string, lastName: string, jerseyNumber: number) {
  return {
    id,
    firstName,
    lastName,
    jerseyNumber,
    position: null,
    secondaryPosition: null,
    birthDate: null,
    active: true,
  };
}

describe('buildCallupMessage', () => {
  const match: MatchWithSquad = {
    id: 'm1',
    seasonId: null,
    opponent: 'CD Rivas',
    matchDate: '2026-03-01T18:00:00.000Z',
    homeAway: 'home',
    competition: 'Liga',
    teamScore: null,
    opponentScore: null,
    notes: null,
    status: 'scheduled',
    periodLengthMinutes: 30,
    squad: [],
  };

  const preset = FORMATION_PRESETS.find((p) => p.id === '1-2-3-1')!;

  function makeFormation(): MatchFormation {
    const gk = player('p-gk', 'Juan', 'Perez', 1);
    const d1 = player('p-d1', 'Marcos', 'Gil', 4);
    const d2 = player('p-d2', 'Raul', 'Ortiz', 2);
    const m1 = player('p-m1', 'Pablo', 'Diaz', 7);
    const m2 = player('p-m2', 'Luis', 'Vega', 8);
    const m3 = player('p-m3', 'Sergio', 'Flor', 11);
    const f1 = player('p-f1', 'Hugo', 'Ramos', 9);
    const sub1 = player('p-sub1', 'Ivan', 'Soto', 14);
    const sub2 = player('p-sub2', 'David', 'Nunez', 16);

    return {
      id: 'form1',
      matchId: 'm1',
      presetId: '1-2-3-1',
      slots: [
        { id: 's-gk', slotKey: 'gk', playerId: gk.id, player: gk, substitutes: [] },
        {
          id: 's-d1',
          slotKey: 'd1',
          playerId: d1.id,
          player: d1,
          substitutes: [{ id: 'sub-a', playerId: sub1.id, player: sub1 }],
        },
        {
          id: 's-d2',
          slotKey: 'd2',
          playerId: d2.id,
          player: d2,
          substitutes: [
            { id: 'sub-b', playerId: sub1.id, player: sub1 },
            { id: 'sub-c', playerId: sub2.id, player: sub2 },
          ],
        },
        { id: 's-m1', slotKey: 'm1', playerId: m1.id, player: m1, substitutes: [] },
        {
          id: 's-m2',
          slotKey: 'm2',
          playerId: m2.id,
          player: m2,
          substitutes: [{ id: 'sub-d', playerId: sub2.id, player: sub2 }],
        },
        { id: 's-m3', slotKey: 'm3', playerId: m3.id, player: m3, substitutes: [] },
        {
          id: 's-f1',
          slotKey: 'f1',
          playerId: f1.id,
          player: f1,
          substitutes: [{ id: 'sub-e', playerId: sub2.id, player: sub2 }],
        },
      ],
    };
  }

  it('builds the agreed message format exactly', () => {
    const message = buildCallupMessage(match, preset, makeFormation());

    // The date label's exact punctuation/order is locale/ICU-dependent, so
    // it's derived the same way the code under test derives it rather than
    // hardcoded — this test is about the grouping/substitute formatting,
    // not about pinning Intl's output.
    const dateLabel = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(match.matchDate));

    expect(message).toBe(
      [
        '⚽ *CONVOCATORIA* — Inter Mitente vs CD Rivas',
        `📅 ${dateLabel} · Liga`,
        '',
        '🟡 *Portero*',
        '*Juan Perez (#1)*',
        '',
        '🔵 *Defensa*',
        'Lateral izquierdo: *Marcos Gil (#4)*',
        '   cambio: Ivan Soto (#14)',
        'Lateral derecho: *Raul Ortiz (#2)*',
        '   cambios: Ivan Soto (#14), David Nunez (#16)',
        '',
        '🟢 *Medio*',
        'Extremo izquierdo: *Pablo Diaz (#7)*',
        'Centrocampista: *Luis Vega (#8)*',
        '   cambio: David Nunez (#16)',
        'Extremo derecho: *Sergio Flor (#11)*',
        '',
        '🔴 *Delantero*',
        '*Hugo Ramos (#9)*',
        '   cambio: David Nunez (#16)',
        '',
        '🪑 *Banquillo*',
        'Ivan Soto (#14)',
        'David Nunez (#16)',
        '',
        '¡Vamos equipo! 💪',
      ].join('\n')
    );
  });

  it('omits the banquillo summary when no slot has substitutes', () => {
    const formation = makeFormation();
    formation.slots = formation.slots.map((s) => ({ ...s, substitutes: [] }));
    const message = buildCallupMessage(match, preset, formation);
    expect(message).not.toContain('Banquillo');
    expect(message).not.toContain('cambio');
  });
});
