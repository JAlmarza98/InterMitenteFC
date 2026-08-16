/**
 * A single match's performance rating: a 0.0-10.0 figure blending goals,
 * assists, cards and own goals, weighted by how little time it took to
 * produce them. Two players with identical goals/assists but different
 * minutes played shouldn't score the same — the one who did it in less
 * time gets the higher rating.
 */
export interface RatingInput {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  secondsPlayed: number;
}

const BASE_RATING = 5.0;
/** Reference window the weights below are calibrated against: a full,
 * regulation-length appearance. */
const REFERENCE_SECONDS = 3600; // 60 min
/** Floor for the normalizing denominator, so a cameo of a couple of
 * minutes doesn't blow a single goal up into an absurd multiplier — the
 * final clamp to [0, 10] bounds it further regardless. */
const MIN_SECONDS_FLOOR = 600; // 10 min
const WEIGHTS = {
  goal: 1.2,
  assist: 0.7,
  yellowCard: -0.6,
  redCard: -2.0,
  ownGoal: -1.5,
};

/** Rating for one match, or `null` if the player didn't actually play
 * (no seconds recorded) — a player who never took the pitch has no
 * performance to rate, and shouldn't show the neutral baseline as if they
 * had an unremarkable game. */
export function computeMatchRating(input: RatingInput): number | null {
  if (input.secondsPlayed <= 0) return null;

  const weighted =
    input.goals * WEIGHTS.goal +
    input.assists * WEIGHTS.assist +
    input.yellowCards * WEIGHTS.yellowCard +
    input.redCards * WEIGHTS.redCard +
    input.ownGoals * WEIGHTS.ownGoal;

  const normalizer = REFERENCE_SECONDS / Math.max(input.secondsPlayed, MIN_SECONDS_FLOOR);
  const clamped = Math.min(10, Math.max(0, BASE_RATING + weighted * normalizer));
  return Math.round(clamped * 10) / 10;
}

/** Mean of per-match ratings, ignoring matches with no rating (unplayed).
 * `null` if there's nothing to average. */
export function averageRating(ratings: (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;
  const mean = valid.reduce((sum, r) => sum + r, 0) / valid.length;
  return Math.round(mean * 10) / 10;
}
