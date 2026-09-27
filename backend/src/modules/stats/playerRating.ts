/**
 * A single match's performance rating: a 0.0-10.0 figure blending goals,
 * assists, penalties won, cards and own goals, weighted by how little time
 * it took to produce them. Two players with identical goals/assists but different
 * minutes played shouldn't score the same — the one who did it in less
 * time gets the higher rating.
 */
export interface RatingInput {
  /** All goals, penalties included. */
  goals: number;
  /** How many of `goals` were penalties — a subset, not extra goals. */
  penaltyGoals: number;
  penaltiesWon: number;
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
  // A penalty is an easier goal than one from open play, so it's worth
  // less — but still clearly positive, and still a full goal everywhere
  // else (scoreline, top scorers).
  penaltyGoal: 0.9,
  // Drawing the foul earns the chance but still leaves it to be scored,
  // so a bit less than an assist.
  penaltyWon: 0.5,
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

  // `goals` already includes the penalties, so they're taken out before
  // the open-play weight applies and then counted at their own weight.
  const penaltyGoals = Math.min(input.penaltyGoals, input.goals);
  const weighted =
    (input.goals - penaltyGoals) * WEIGHTS.goal +
    penaltyGoals * WEIGHTS.penaltyGoal +
    input.penaltiesWon * WEIGHTS.penaltyWon +
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
