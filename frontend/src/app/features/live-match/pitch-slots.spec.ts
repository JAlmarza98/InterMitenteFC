import { FORMATION_PRESETS } from '../matches/formation/formation-presets';
import { placePlayers, shortNames } from './pitch-slots';

const SLOTS = FORMATION_PRESETS[0].slots; // 1-2-3-1: gk d1 d2 m1 m2 m3 f1
const PLAN = new Map([
  ['gk', 'p1'],
  ['d1', 'p2'],
  ['d2', 'p3'],
  ['m1', 'p4'],
  ['m2', 'p5'],
  ['m3', 'p6'],
  ['f1', 'p7'],
]);
const bySlot = (placed: ReturnType<typeof placePlayers>) =>
  Object.fromEntries(placed.map((p) => [p.slot.key, p.playerId]));

describe('placePlayers', () => {
  it('puts the planned starters in their slots', () => {
    const placed = placePlayers(SLOTS, PLAN, [], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(bySlot(placed)).toEqual(Object.fromEntries(PLAN));
  });

  it('hands the slot to the incoming player, even across chained substitutions', () => {
    const placed = placePlayers(
      SLOTS,
      PLAN,
      [
        { inId: 's1', outId: 'p4' },
        { inId: 'p4', outId: 's1' },
        { inId: 's2', outId: 'p4' },
      ],
      ['p1', 'p2', 'p3', 's2', 'p5', 'p6', 'p7']
    );
    expect(bySlot(placed)['m1']).toBe('s2');
  });

  it('leaves a sent-off player’s slot empty', () => {
    const placed = placePlayers(SLOTS, PLAN, [], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(bySlot(placed)['f1']).toBeUndefined();
    expect(placed.length).toBe(6);
  });

  it('fills free slots with on-pitch players the plan did not cover', () => {
    const placed = placePlayers(SLOTS, new Map(), [], ['a', 'b']);
    expect(bySlot(placed)).toEqual({ gk: 'a', d1: 'b' });
  });
});

describe('shortNames', () => {
  it('trims, falls back to the last name and disambiguates shared first names', () => {
    const names = shortNames([
      { id: '1', firstName: ' Iván', lastName: 'Viedma' },
      { id: '2', firstName: 'Iván', lastName: 'Timón' },
      { id: '3', firstName: ' ', lastName: 'Burbu' },
      { id: '4', firstName: 'Adrián ', lastName: 'Martínez ' },
    ]);
    expect([...names.values()]).toEqual(['Iván V.', 'Iván T.', 'Burbu', 'Adrián']);
  });
});
