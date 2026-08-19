import { describe, it, expect } from "vitest";
import { computeMatchRating, averageRating, RatingInput } from "../../src/modules/stats/playerRating";

function input(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    secondsPlayed: 3600,
    ...overrides,
  };
}

describe("computeMatchRating", () => {
  it("returns null when the player didn't play", () => {
    expect(computeMatchRating(input({ secondsPlayed: 0 }))).toBeNull();
  });

  it("returns the neutral baseline for a scoreless full match", () => {
    expect(computeMatchRating(input())).toBe(5.0);
  });

  it("rewards goals above the baseline", () => {
    const rating = computeMatchRating(input({ goals: 1 }));
    expect(rating).not.toBeNull();
    expect(rating!).toBeGreaterThan(5.0);
  });

  it("weighs the same output more heavily for less time played", () => {
    const fullMatch = computeMatchRating(input({ goals: 1, secondsPlayed: 3600 }));
    const cameo = computeMatchRating(input({ goals: 1, secondsPlayed: 900 }));
    expect(cameo!).toBeGreaterThan(fullMatch!);
  });

  it("clamps a very bad match (red card) to the floor of 0", () => {
    const rating = computeMatchRating(
      input({ redCards: 1, yellowCards: 1, ownGoals: 2, secondsPlayed: 300 })
    );
    expect(rating).toBe(0);
  });

  it("clamps an outstanding cameo to the ceiling of 10", () => {
    const rating = computeMatchRating(input({ goals: 5, assists: 5, secondsPlayed: 60 }));
    expect(rating).toBe(10);
  });
});

describe("averageRating", () => {
  it("returns null when there is nothing to average", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([null, null])).toBeNull();
  });

  it("ignores unplayed (null) matches", () => {
    expect(averageRating([6, null, 8])).toBe(7);
  });

  it("rounds to one decimal place", () => {
    expect(averageRating([6, 7, 7])).toBeCloseTo(6.7, 5);
  });
});
