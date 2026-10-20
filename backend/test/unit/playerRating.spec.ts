import { describe, it, expect } from "vitest";
import {
  computeMatchRating,
  averageRating,
  countGoalsWhileOnPitch,
  RatingInput,
} from "../../src/modules/stats/playerRating";

function input(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    goals: 0,
    penaltyGoals: 0,
    penaltiesWon: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    secondsPlayed: 3600,
    goalsForWhileOnPitch: 0,
    goalsAgainstWhileOnPitch: 0,
    isGoalkeeper: false,
    ...overrides,
  };
}

describe("computeMatchRating", () => {
  it("returns null when the player didn't play", () => {
    expect(computeMatchRating(input({ secondsPlayed: 0 }))).toBeNull();
  });

  it("rates a player booked without playing on the same minimum-time scale as a cameo", () => {
    // 5 − 0.6 × (60 min / 10 min floor)
    expect(computeMatchRating(input({ yellowCards: 1, secondsPlayed: 0 }))).toBe(1.4);
    expect(computeMatchRating(input({ redCards: 1, secondsPlayed: 0 }))).toBe(0);
    expect(computeMatchRating(input({ yellowCards: 1, secondsPlayed: 0 }))).toBe(
      computeMatchRating(input({ yellowCards: 1, secondsPlayed: 60 }))
    );
  });

  it("returns the neutral baseline for a scoreless full match", () => {
    expect(computeMatchRating(input())).toBe(5.0);
  });

  it("rewards goals above the baseline", () => {
    const rating = computeMatchRating(input({ goals: 1 }));
    expect(rating).not.toBeNull();
    expect(rating!).toBeGreaterThan(5.0);
  });

  it("values a penalty goal above nothing but below an open-play goal", () => {
    const openPlay = computeMatchRating(input({ goals: 1 }))!;
    const penalty = computeMatchRating(input({ goals: 1, penaltyGoals: 1 }))!;
    expect(penalty).toBeGreaterThan(5.0);
    expect(penalty).toBeLessThan(openPlay);
    expect(penalty).toBe(5.9);
  });

  it("only discounts the penalties, not the player's other goals", () => {
    // 2 open-play goals (2 × 1.2) + 1 penalty (0.9) over a full match.
    expect(computeMatchRating(input({ goals: 3, penaltyGoals: 1 }))).toBe(8.3);
  });

  it("rewards winning a penalty, a bit less than an assist", () => {
    const penaltyWon = computeMatchRating(input({ penaltiesWon: 1 }))!;
    const assist = computeMatchRating(input({ assists: 1 }))!;
    expect(penaltyWon).toBe(5.5);
    expect(penaltyWon).toBeLessThan(assist);
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

  it("gives a non-scoring player context credit for team goals while they were on the pitch", () => {
    expect(computeMatchRating(input({ goalsForWhileOnPitch: 2 }))).toBe(5.4);
  });

  it("penalizes a non-scoring player for goals conceded while they were on the pitch", () => {
    expect(computeMatchRating(input({ goalsAgainstWhileOnPitch: 2 }))).toBe(4.6);
  });

  it("doesn't amplify a brief cameo's conceded-goal penalty the way it would a scored goal", () => {
    const fullMatch = computeMatchRating(input({ goalsAgainstWhileOnPitch: 1, secondsPlayed: 3600 }));
    const cameo = computeMatchRating(input({ goalsAgainstWhileOnPitch: 1, secondsPlayed: 60 }));
    expect(cameo).toBe(fullMatch);
  });

  it("doesn't reward a non-goalkeeper for a clean sheet beyond the plain plus/minus", () => {
    expect(computeMatchRating(input({ isGoalkeeper: false, goalsAgainstWhileOnPitch: 0 }))).toBe(5.0);
  });

  it("rewards the goalkeeper for a full-match clean sheet, not just the absence of a penalty", () => {
    const rating = computeMatchRating(input({ isGoalkeeper: true, goalsAgainstWhileOnPitch: 0 }));
    expect(rating).toBe(7.0);
  });

  it("prorates the goalkeeper's clean sheet bonus for a shorter appearance", () => {
    const rating = computeMatchRating(
      input({ isGoalkeeper: true, goalsAgainstWhileOnPitch: 0, secondsPlayed: 1800 })
    );
    expect(rating).toBe(6.0);
  });

  it("gives the goalkeeper no clean sheet bonus once they've conceded", () => {
    const rating = computeMatchRating(input({ isGoalkeeper: true, goalsAgainstWhileOnPitch: 1 }));
    expect(rating).toBe(4.8);
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

describe("countGoalsWhileOnPitch", () => {
  const segments = [
    { startSecond: 0, endSecond: 1800 },
    { startSecond: 2400, endSecond: 3600 },
  ];

  it("counts a goal inside a segment and excludes one outside all segments", () => {
    expect(countGoalsWhileOnPitch([900, 2000, 3000], segments, null)).toBe(2);
  });

  it("treats a still-open segment as extending to the live current second", () => {
    const openSegment = [{ startSecond: 0, endSecond: null }];
    expect(countGoalsWhileOnPitch([1000], openSegment, 1500)).toBe(1);
    expect(countGoalsWhileOnPitch([2000], openSegment, 1500)).toBe(0);
  });
});
