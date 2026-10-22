import { describe, it, expect } from "vitest";
import {
  computeMatchRating,
  averageRating,
  countGoalsWhileOnPitch,
  expectedGoals,
  matchGoalkeeperId,
  normalizeTeamName,
  outfieldRole,
  reconcileGoalSeconds,
  splitCards,
  GoalkeeperCandidate,
  RatingInput,
} from "../../src/modules/stats/playerRating";

/** A full 50' match with nothing recorded, against a rival with no
 * expectation either way: everything here rates exactly 5.0. */
function input(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    role: "MID",
    secondsPlayed: 3000,
    matchSeconds: 3000,
    goals: 0,
    penaltyGoals: 0,
    penaltiesWon: 0,
    assists: 0,
    ownGoals: 0,
    keyActions: 0,
    keyErrors: 0,
    yellowCards: 0,
    redCards: 0,
    benchYellowCards: 0,
    benchRedCards: 0,
    goalsForWhileOnPitch: 0,
    goalsAgainstWhileOnPitch: 0,
    expectedGoalsFor: 0,
    expectedGoalsAgainst: 0,
    topRank: 0,
    ...overrides,
  };
}

describe("computeMatchRating", () => {
  it("returns null when the player neither played nor has anything recorded", () => {
    expect(computeMatchRating(input({ secondsPlayed: 0 }))).toBeNull();
  });

  it("starts everyone at 5", () => {
    expect(computeMatchRating(input())).toBe(5.0);
    expect(computeMatchRating(input({ role: "GK" }))).toBe(5.0);
  });

  it("values personal actions the same in every position", () => {
    for (const role of ["GK", "DEF", "MID", "FWD"] as const) {
      expect(computeMatchRating(input({ role, goals: 1 }))).toBe(6.2);
      expect(computeMatchRating(input({ role, assists: 1 }))).toBe(5.7);
      expect(computeMatchRating(input({ role, keyActions: 1 }))).toBe(5.8);
      expect(computeMatchRating(input({ role, keyErrors: 1 }))).toBe(4.2);
    }
  });

  it("weighs penalties apart from open-play goals", () => {
    // 2 open-play goals (2 x 1.2) + 1 penalty (0.9).
    expect(computeMatchRating(input({ goals: 3, penaltyGoals: 1 }))).toBe(8.3);
    expect(computeMatchRating(input({ penaltiesWon: 1 }))).toBe(5.5);
  });

  it("scales the same output by the square root of the time ratio, at most x2", () => {
    expect(computeMatchRating(input({ goals: 1, secondsPlayed: 1500 }))).toBe(6.7); // x1.41
    expect(computeMatchRating(input({ goals: 1, secondsPlayed: 750 }))).toBe(7.4); // x2
    expect(computeMatchRating(input({ goals: 1, secondsPlayed: 60 }))).toBe(7.4); // capped
  });

  it("rates stats entered without playing time at the maximum factor", () => {
    expect(computeMatchRating(input({ goals: 1, secondsPlayed: 0 }))).toBe(7.4);
  });

  it("credits goals conceded below what's expected mostly to the goalkeeper and defenders", () => {
    const conceded1Of3 = { expectedGoalsAgainst: 3, goalsAgainstWhileOnPitch: 1 };
    expect(computeMatchRating(input({ role: "GK", ...conceded1Of3 }))).toBe(6.6);
    expect(computeMatchRating(input({ role: "DEF", ...conceded1Of3 }))).toBe(6.0);
    expect(computeMatchRating(input({ role: "FWD", ...conceded1Of3 }))).toBe(5.1);
  });

  it("credits goals scored above what's expected mostly to midfielders and forwards", () => {
    const scored3Of1 = { expectedGoalsFor: 1, goalsForWhileOnPitch: 3 };
    expect(computeMatchRating(input({ role: "FWD", ...scored3Of1 }))).toBe(5.8);
    expect(computeMatchRating(input({ role: "GK", ...scored3Of1 }))).toBe(5.0);
  });

  it("measures the team context over the player's own minutes", () => {
    // Half the match without conceding, against a 3-goal expectation: 1.5
    // goals saved x 0.5, scaled like any output in half the time (x1.41).
    expect(
      computeMatchRating(input({ role: "DEF", secondsPlayed: 1500, expectedGoalsAgainst: 3 }))
    ).toBe(6.1);
  });

  it("only blames by half for a worse-than-expected team result", () => {
    expect(computeMatchRating(input({ role: "GK", expectedGoalsAgainst: 3, goalsAgainstWhileOnPitch: 5 }))).toBe(4.2);
  });

  it("caps how far the team context can lift or sink a player", () => {
    expect(computeMatchRating(input({ role: "GK", expectedGoalsAgainst: 6 }))).toBe(8.0);
    expect(computeMatchRating(input({ role: "GK", expectedGoalsAgainst: 1, goalsAgainstWhileOnPitch: 10 }))).toBe(3.5);
  });

  it("punishes a card from the bench hard, whether or not the player had played", () => {
    expect(computeMatchRating(input({ secondsPlayed: 0, benchYellowCards: 1 }))).toBe(1.4);
    expect(computeMatchRating(input({ secondsPlayed: 0, benchRedCards: 1 }))).toBe(0);
    expect(computeMatchRating(input({ benchYellowCards: 1 }))).toBe(1.4);
    // A yellow on the pitch is an ordinary minus.
    expect(computeMatchRating(input({ yellowCards: 1 }))).toBe(4.4);
  });

  it("adds the admin's top 3 bonus", () => {
    expect(computeMatchRating(input({ topRank: 1 }))).toBe(6.5);
    expect(computeMatchRating(input({ topRank: 2 }))).toBe(6.0);
    expect(computeMatchRating(input({ topRank: 3 }))).toBe(5.5);
  });

  it("clamps to the 0-10 scale", () => {
    expect(computeMatchRating(input({ goals: 5, assists: 5, topRank: 1 }))).toBe(10);
    expect(computeMatchRating(input({ redCards: 1, ownGoals: 2, secondsPlayed: 300 }))).toBe(0);
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

describe("outfieldRole", () => {
  it("maps profile positions to a role, midfield when unknown", () => {
    expect(outfieldRole("Defensa central", null)).toBe("DEF");
    expect(outfieldRole("Lateral izquierdo", null)).toBe("DEF");
    expect(outfieldRole("Delantero", null)).toBe("FWD");
    expect(outfieldRole("Extremo derecho", null)).toBe("MID");
    expect(outfieldRole("Polivalente", null)).toBe("MID");
    expect(outfieldRole(null, null)).toBe("MID");
  });

  it("uses a profile goalkeeper's secondary position when they play outfield", () => {
    expect(outfieldRole("Portero", "Delantero")).toBe("FWD");
  });
});

describe("matchGoalkeeperId", () => {
  const candidate = (playerId: string, overrides: Partial<GoalkeeperCandidate> = {}): GoalkeeperCandidate => ({
    playerId,
    position: "Defensa central",
    secondaryPosition: null,
    secondsPlayed: 1500,
    segments: [{ startSecond: 0, endSecond: 1500 }],
    ...overrides,
  });
  const wholeMatch = { secondsPlayed: 3000, segments: [{ startSecond: 0, endSecond: 3000 }] };

  it("prefers the formation's goalkeeper when they played", () => {
    expect(matchGoalkeeperId([candidate("a"), candidate("b", { position: "Portero" })], "a", 3000)).toBe("a");
  });

  it("falls back to the profile goalkeeper who played", () => {
    expect(matchGoalkeeperId([candidate("a", wholeMatch), candidate("b", { position: "Portero" })], null, 3000)).toBe(
      "b"
    );
  });

  it("else picks whoever played the whole match without coming off", () => {
    expect(matchGoalkeeperId([candidate("a"), candidate("b", wholeMatch)], null, 3000)).toBe("b");
    // Still on the pitch in a live match counts too.
    expect(
      matchGoalkeeperId([candidate("a", { segments: [{ startSecond: 0, endSecond: null }] })], null, 3000)
    ).toBe("a");
  });

  it("breaks a tie on the secondary position, or gives up", () => {
    const tie = [candidate("a", wholeMatch), candidate("b", { ...wholeMatch, secondaryPosition: "Portero" })];
    expect(matchGoalkeeperId(tie, null, 3000)).toBe("b");
    expect(matchGoalkeeperId([candidate("a", wholeMatch), candidate("b", wholeMatch)], null, 3000)).toBeNull();
  });
});

describe("reconcileGoalSeconds", () => {
  const goal = (second: number, playerId: string) => ({ type: "goal", second, playerId });
  const against = (second: number) => ({ type: "opponent_goal", second, playerId: null });

  it("drops goal events the corrected totals no longer back (double taps, phantom goals)", () => {
    const events = [goal(100, "a"), goal(129, "a"), goal(900, "b"), { type: "penalty_goal", second: 500, playerId: "c" }];
    const goals = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    expect(reconcileGoalSeconds(events, goals, new Map(), 2, null).forSeconds).toEqual([100, 900]);
  });

  it("gives up on timestamps when they don't add up to the official score", () => {
    const result = reconcileGoalSeconds([goal(100, "a"), against(200)], new Map([["a", 1]]), new Map(), 2, 2);
    expect(result).toEqual({ forSeconds: null, againstSeconds: null });
  });

  it("trusts the events while there's no official score", () => {
    expect(reconcileGoalSeconds([against(200)], new Map(), new Map(), null, null).againstSeconds).toEqual([200]);
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

describe("splitCards", () => {
  const segments = [{ startSecond: 0, endSecond: 1200 }];

  it("tells cards on the pitch from cards shown on the bench", () => {
    expect(splitCards([600, 2000], 2, segments, 1200)).toEqual({ onPitch: 1, bench: 1 });
  });

  it("counts a red card at the very second it closed the segment as on the pitch", () => {
    expect(splitCards([1200], 1, segments, 1200)).toEqual({ onPitch: 1, bench: 0 });
  });

  it("places corrected cards with no event by whether the player played", () => {
    expect(splitCards([], 1, [], 0)).toEqual({ onPitch: 0, bench: 1 });
    expect(splitCards([], 1, segments, 1200)).toEqual({ onPitch: 1, bench: 0 });
  });

  it("ignores card events the corrected total no longer backs", () => {
    expect(splitCards([600, 2000], 1, segments, 1200)).toEqual({ onPitch: 1, bench: 0 });
  });
});

describe("expectedGoals", () => {
  it("uses the league average for an unknown rival", () => {
    expect(expectedGoals(null, 2.9)).toEqual({ expectedFor: 2.9, expectedAgainst: 2.9 });
  });

  it("blends a short record with two league-average matches", () => {
    const { expectedFor, expectedAgainst } = expectedGoals({ goalsFor: 13, goalsAgainst: 4, played: 2 }, 2.9);
    expect(expectedAgainst).toBeCloseTo(4.7, 5); // (13 + 2 x 2.9) / 4
    expect(expectedFor).toBeCloseTo(2.45, 5); // (4 + 2 x 2.9) / 4
  });
});

describe("normalizeTeamName", () => {
  it("matches names written differently", () => {
    expect(normalizeTeamName("Fontanería R.Rubio")).toBe(normalizeTeamName("FONTANERÍA R. RUBIO"));
    expect(normalizeTeamName("BONBON 420")).toBe(normalizeTeamName("Bonbon420"));
  });
});
