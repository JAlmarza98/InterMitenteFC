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
  /** Team goals scored while this player was on the pitch (own goals they
   * scored included) — context credit for players who don't score/assist
   * themselves, independent of their own stat line. */
  goalsForWhileOnPitch: number;
  /** Goals conceded while this player was on the pitch. */
  goalsAgainstWhileOnPitch: number;
  /** Whether this player is the goalkeeper (by primary or secondary
   * position) — a clean sheet is specifically their job, so it earns a
   * bonus the generic goalsAgainstWhileOnPitch penalty alone can't give:
   * avoiding a penalty never lifts a rating above baseline on its own. */
  isGoalkeeper: boolean;
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
  // Small plus/minus for match context, same idea as hockey/basketball
  // plus-minus: being on the pitch for a team goal either way, regardless
  // of personal involvement. Kept well below the personal weights above so
  // it nudges rather than dominates.
  teamGoalFor: 0.2,
  teamGoalAgainst: -0.2,
  // The keeper's actual job. Full credit for a full match kept clean;
  // prorated for a shorter one (coming on as a sub, etc). Weighted high
  // enough that a full-match clean sheet alone clears a comfortable win
  // above baseline (0-0 -> 7.0, 5-0 -> 8.0) — otherwise a keeper, who
  // almost never scores or assists, has no way to post an outstanding
  // rating the way an outfield player can.
  goalkeeperCleanSheet: 2.0,
};

/** Rating for one match, or `null` if the player neither played (no
 * seconds recorded) nor did anything — someone who stayed on the bench
 * shouldn't show the neutral baseline as if they'd had an unremarkable
 * game. A player booked without ever coming on (a card shown to the bench)
 * does get rated, on the same scale as everyone else: they count as the
 * MIN_SECONDS_FLOOR minimum, so a yellow alone is already a harsh mark. */
export function computeMatchRating(input: RatingInput): number | null {
  const didSomething =
    input.goals > 0 ||
    input.penaltiesWon > 0 ||
    input.assists > 0 ||
    input.yellowCards > 0 ||
    input.redCards > 0 ||
    input.ownGoals > 0;
  if (input.secondsPlayed <= 0 && !didSomething) return null;

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

  // Context adjustment is NOT run through the per-minute normalizer above:
  // that normalizer rewards packing personal production into less time,
  // which makes sense for a goal you scored but not for a goal your team
  // conceded while you happened to be on for only a few minutes — that
  // shouldn't get amplified into a huge penalty.
  const cleanSheetBonus =
    input.isGoalkeeper && input.goalsAgainstWhileOnPitch === 0
      ? WEIGHTS.goalkeeperCleanSheet * Math.min(1, input.secondsPlayed / REFERENCE_SECONDS)
      : 0;
  const contextAdjustment =
    input.goalsForWhileOnPitch * WEIGHTS.teamGoalFor +
    input.goalsAgainstWhileOnPitch * WEIGHTS.teamGoalAgainst +
    cleanSheetBonus;

  const clamped = Math.min(10, Math.max(0, BASE_RATING + weighted * normalizer + contextAdjustment));
  return Math.round(clamped * 10) / 10;
}

/** Which of `goalSeconds` happened while the player held at least one
 * matching playing-time segment — i.e. goals scored/conceded while they
 * were actually on the pitch. `liveCurrentSecond` closes off segments
 * still open on a live match; pass `null` for finished matches. */
export function countGoalsWhileOnPitch(
  goalSeconds: number[],
  segments: { startSecond: number; endSecond: number | null }[],
  liveCurrentSecond: number | null
): number {
  return goalSeconds.filter((second) =>
    segments.some((segment) => {
      const end = segment.endSecond ?? liveCurrentSecond ?? Infinity;
      return second >= segment.startSecond && second < end;
    })
  ).length;
}

/** Mean of per-match ratings, ignoring matches with no rating (unplayed).
 * `null` if there's nothing to average. */
export function averageRating(ratings: (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;
  const mean = valid.reduce((sum, r) => sum + r, 0) / valid.length;
  return Math.round(mean * 10) / 10;
}
