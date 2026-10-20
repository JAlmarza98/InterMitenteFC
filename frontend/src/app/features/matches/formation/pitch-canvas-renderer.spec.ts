import { MatchFormation } from '../../../core/services/matches.service';
import { capSubNames, computeCanvasHeight, fitText } from './pitch-canvas-renderer';

function player(id: string) {
  return {
    id,
    firstName: 'F',
    lastName: 'L',
    jerseyNumber: 1,
    position: null,
    secondaryPosition: null,
    birthDate: null,
    active: true,
  };
}

function formationWithSubCounts(counts: number[]): MatchFormation {
  return {
    id: 'f1',
    matchId: 'm1',
    presetId: '1-2-3-1',
    slots: counts.map((count, i) => ({
      id: `slot-${i}`,
      slotKey: `k${i}`,
      playerId: `p${i}`,
      player: player(`p${i}`),
      substitutes: Array.from({ length: count }, (_, j) => ({
        id: `sub-${i}-${j}`,
        playerId: `sub-${i}-${j}`,
        player: player(`sub-${i}-${j}`),
      })),
    })),
  };
}

describe('capSubNames', () => {
  it('leaves a short list untouched', () => {
    expect(capSubNames(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('caps a long list and appends a "+N más" line', () => {
    expect(capSubNames(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', '+2 más']);
  });

  it('shows exactly the max with no extra line when the count matches it', () => {
    expect(capSubNames(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('computeCanvasHeight', () => {
  it('uses the base height when no slot exceeds the shown-substitute cap', () => {
    const base = computeCanvasHeight(formationWithSubCounts([0, 1, 4]));
    expect(computeCanvasHeight(formationWithSubCounts([]))).toBe(base);
  });

  it('grows the canvas when a slot has more substitutes than the cap', () => {
    const base = computeCanvasHeight(formationWithSubCounts([4]));
    const taller = computeCanvasHeight(formationWithSubCounts([6]));
    expect(taller).toBeGreaterThan(base);
    expect(taller - base).toBe(2 * 26); // 2 extra subs beyond the cap of 4, 26px each
  });

  it('sizes off the worst-case slot, not the total across slots', () => {
    const manySmallSlots = computeCanvasHeight(formationWithSubCounts([2, 2, 2, 2]));
    const oneBigSlot = computeCanvasHeight(formationWithSubCounts([4, 0, 0, 0]));
    expect(manySmallSlots).toBe(oneBigSlot);
  });
});

describe('fitText', () => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const buildFont = (px: number) => `700 ${px}px sans-serif`;

  it('keeps the starting size and the full text when it already fits', () => {
    const result = fitText(ctx, 'Leo', buildFont, 32, 20, 300);
    expect(result.font).toBe(buildFont(32));
    expect(result.text).toBe('Leo');
  });

  it('shrinks the font before truncating when the text fits at the floor size', () => {
    const name = 'Alessandro Fernandez';
    ctx.font = buildFont(20);
    const widthAtFloor = ctx.measureText(name).width;
    // maxWidth set just above the floor-size width: too narrow for the
    // starting 32px, but the 20px floor fits — shrinking alone should
    // suffice, with no truncation needed.
    const result = fitText(ctx, name, buildFont, 32, 20, widthAtFloor + 5);
    expect(result.text).toBe(name);
    expect(result.font).not.toBe(buildFont(32));
    expect(result.width).toBeLessThanOrEqual(widthAtFloor + 5);
  });

  it('truncates with an ellipsis once even the floor size does not fit', () => {
    const result = fitText(ctx, 'Maximiliano Covarrubias Etxeberria', buildFont, 32, 20, 100);
    expect(result.font).toBe(buildFont(20));
    expect(result.text.endsWith('…')).toBeTrue();
    expect(result.text.length).toBeLessThan('Maximiliano Covarrubias Etxeberria'.length);
    expect(result.width).toBeLessThanOrEqual(100);
  });
});
