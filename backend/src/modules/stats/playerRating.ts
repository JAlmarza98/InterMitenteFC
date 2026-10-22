/**
 * A single match's performance rating, 0.0-10.0. Everyone starts at 5 and
 * is judged by their own job: personal actions are worth the same in every
 * position, while the team's result during the player's own minutes on the
 * pitch counts by position — goals conceded for the goalkeeper and
 * defenders, goals scored for midfielders and forwards — measured against
 * what's normal versus that rival. Reasoning and calibration (against the
 * real 2026/27 matches): docs/plans/nota-por-puesto.md.
 */
export type Role = "GK" | "DEF" | "MID" | "FWD";

export interface RatingInput {
  role: Role;
  secondsPlayed: number;
  /** Real duration of the match so far — what was actually played in each
   * period, not the configured period length. */
  matchSeconds: number;
  /** All goals, penalties included. */
  goals: number;
  /** How many of `goals` were penalties — a subset, not extra goals. */
  penaltyGoals: number;
  penaltiesWon: number;
  assists: number;
  ownGoals: number;
  keyActions: number;
  keyErrors: number;
  /** Cards shown while on the pitch. */
  yellowCards: number;
  redCards: number;
  /** Cards shown from the bench (subbed off, or never came on). They're only
   * given for insults or fights, so they're punished hard regardless of
   * minutes played. */
  benchYellowCards: number;
  benchRedCards: number;
  /** Team goals while the player was on the pitch. Fractional when the
   * match has no reliable goal timestamps and the scoreline is prorated. */
  goalsForWhileOnPitch: number;
  goalsAgainstWhileOnPitch: number;
  /** Goals a team would be expected to score/concede against this rival
   * over a whole match. */
  expectedGoalsFor: number;
  expectedGoalsAgainst: number;
  /** Admin-picked top 3 of the match (1 = best), or 0. */
  topRank: number;
}

const BASE_RATING = 5.0;
const WEIGHTS = {
  goal: 1.2,
  // An easier goal than one from open play, still a full goal everywhere
  // else (scoreline, top scorers).
  penaltyGoal: 0.9,
  // Drawing the foul earns the chance but still leaves it to be scored.
  penaltyWon: 0.5,
  assist: 0.7,
  yellowCard: -0.6,
  redCard: -2.0,
  ownGoal: -1.5,
  keyAction: 0.8,
  keyError: -0.8,
  // A yellow from the bench alone leaves a 1.4, a red a 0.
  benchYellowCard: -3.6,
  benchRedCard: -10,
};
const TOP_RANK_BONUS = [1.5, 1.0, 0.5];
/** Per goal conceded below (+) or above (-) what's expected, during the
 * player's own minutes. */
const DEFENSE_WEIGHT: Record<Role, number> = { GK: 0.8, DEF: 0.5, MID: 0.25, FWD: 0.05 };
/** Per goal scored above (+) or below (-) what's expected. */
const ATTACK_WEIGHT: Record<Role, number> = { GK: 0, DEF: 0.05, MID: 0.25, FWD: 0.4 };
/** The team's result rewards in full but blames by half, and can only sink
 * a player so far: in fútbol 7 a lot of goals go in and each one is shared
 * by the whole back line. Individual blame (cards, own goals, ⚠️) counts in
 * full instead. */
const NEGATIVE_CONTEXT_SCALE = 0.5;
const CONTEXT_MIN = -1.5;
const CONTEXT_MAX = 3;
/** The same output in fewer minutes is worth more, but by the square root
 * of the time ratio and at most x2 (a quarter of the match): one goal in a
 * short spell is mostly one chance falling your way, not a rate to
 * extrapolate — and with rolling subs, minutes are the coach's call. */
const MAX_MINUTES_FACTOR = 2;

/** Rating for one match, or `null` if the player neither played nor has
 * anything recorded — someone who stayed on the bench shouldn't show a
 * neutral baseline as if they'd had an unremarkable game. */
export function computeMatchRating(input: RatingInput): number | null {
  const recorded =
    input.goals +
    input.penaltiesWon +
    input.assists +
    input.ownGoals +
    input.keyActions +
    input.keyErrors +
    input.yellowCards +
    input.redCards +
    input.benchYellowCards +
    input.benchRedCards;
  if (input.secondsPlayed <= 0 && recorded === 0) return null;

  const penaltyGoals = Math.min(input.penaltyGoals, input.goals);
  const personal =
    (input.goals - penaltyGoals) * WEIGHTS.goal +
    penaltyGoals * WEIGHTS.penaltyGoal +
    input.penaltiesWon * WEIGHTS.penaltyWon +
    input.assists * WEIGHTS.assist +
    input.ownGoals * WEIGHTS.ownGoal +
    input.keyActions * WEIGHTS.keyAction +
    input.keyErrors * WEIGHTS.keyError +
    input.yellowCards * WEIGHTS.yellowCard +
    input.redCards * WEIGHTS.redCard;
  const bench = input.benchYellowCards * WEIGHTS.benchYellowCard + input.benchRedCards * WEIGHTS.benchRedCard;

  // Stats entered without playing time (an admin correction) count at the
  // maximum factor, with no minutes for the team context to cover.
  const played = input.secondsPlayed > 0;
  const matchSeconds = Math.max(input.matchSeconds, input.secondsPlayed, 1);
  const factor = played ? Math.min(MAX_MINUTES_FACTOR, Math.sqrt(matchSeconds / input.secondsPlayed)) : MAX_MINUTES_FACTOR;
  const share = played ? Math.min(1, input.secondsPlayed / matchSeconds) : 0;

  const soften = (v: number) => (v < 0 ? v * NEGATIVE_CONTEXT_SCALE : v);
  const defense = (input.expectedGoalsAgainst * share - input.goalsAgainstWhileOnPitch) * DEFENSE_WEIGHT[input.role];
  const attack = (input.goalsForWhileOnPitch - input.expectedGoalsFor * share) * ATTACK_WEIGHT[input.role];
  const context = Math.min(CONTEXT_MAX, Math.max(CONTEXT_MIN, (soften(defense) + soften(attack)) * factor));

  const top = TOP_RANK_BONUS[input.topRank - 1] ?? 0;
  const rating = BASE_RATING + personal * factor + context + top + bench;
  return Math.round(Math.min(10, Math.max(0, rating)) * 10) / 10;
}

/** Mean of per-match ratings, ignoring matches with no rating (unplayed).
 * `null` if there's nothing to average. */
export function averageRating(ratings: (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;
  const mean = valid.reduce((sum, r) => sum + r, 0) / valid.length;
  return Math.round(mean * 10) / 10;
}

const ROLE_BY_POSITION: Record<string, Role> = {
  "Defensa central": "DEF",
  "Lateral derecho": "DEF",
  "Lateral izquierdo": "DEF",
  Delantero: "FWD",
};

/** Outfield role from the profile (midfield when unknown). The goalkeeper
 * is decided per match instead (see `matchGoalkeeperId`), so a profile
 * goalkeeper playing outfield takes their secondary position. */
export function outfieldRole(position: string | null, secondaryPosition: string | null): Role {
  const effective = position === "Portero" ? secondaryPosition : position;
  return (effective && ROLE_BY_POSITION[effective]) || "MID";
}

type Segment = { startSecond: number; endSecond: number | null };

export interface GoalkeeperCandidate {
  playerId: string;
  position: string | null;
  secondaryPosition: string | null;
  secondsPlayed: number;
  segments: Segment[];
}

/** Who played in goal: there's one per match and they're almost never
 * changed. The formation's goalkeeper if they played; else the profile
 * goalkeeper who played; else whoever played the whole match without
 * coming off (preferring a secondary "Portero" if several did); else
 * nobody, and everyone is rated by their profile. */
export function matchGoalkeeperId(
  candidates: GoalkeeperCandidate[],
  formationGoalkeeperId: string | null,
  matchSeconds: number
): string | null {
  const played = candidates.filter((c) => c.secondsPlayed > 0);
  if (formationGoalkeeperId && played.some((c) => c.playerId === formationGoalkeeperId)) return formationGoalkeeperId;

  const profileKeeper = played
    .filter((c) => c.position === "Portero")
    .sort((a, b) => b.secondsPlayed - a.secondsPlayed)[0];
  if (profileKeeper) return profileKeeper.playerId;

  // A few seconds of slack: the final whistle and the last segment's end
  // are stamped by separate requests.
  const wholeMatch = played.filter(
    (c) =>
      c.segments.length === 1 &&
      c.segments[0].startSecond === 0 &&
      (c.segments[0].endSecond ?? matchSeconds) >= matchSeconds - 5
  );
  if (wholeMatch.length === 1) return wholeMatch[0].playerId;
  const secondaryKeepers = wholeMatch.filter((c) => c.secondaryPosition === "Portero");
  return secondaryKeepers.length === 1 ? secondaryKeepers[0].playerId : null;
}

type TimedEvent = { type: string; second: number; playerId: string | null };

/**
 * Seconds of the team's goals for/against, reconciled with the corrected
 * totals: per player, at most as many goal (own goal) events as they have
 * goals (own goals) after corrections — which drops double taps and phantom
 * goals that were only fixed in the totals. `null` when the timed goals
 * still don't add up to the official score; the caller then prorates the
 * scoreline instead.
 */
export function reconcileGoalSeconds(
  events: TimedEvent[],
  goalsByPlayer: Map<string, number>,
  ownGoalsByPlayer: Map<string, number>,
  teamScore: number | null,
  opponentScore: number | null
): { forSeconds: number[] | null; againstSeconds: number[] | null } {
  const capped = (types: string[], allowed: Map<string, number>) => {
    const used = new Map<string, number>();
    return events
      .filter((e) => types.includes(e.type))
      .sort((a, b) => a.second - b.second)
      .filter((e) => {
        if (!e.playerId) return true;
        const count = (used.get(e.playerId) ?? 0) + 1;
        used.set(e.playerId, count);
        return count <= (allowed.get(e.playerId) ?? 0);
      })
      .map((e) => e.second);
  };
  const forSeconds = capped(["goal", "penalty_goal"], goalsByPlayer);
  const againstSeconds = capped(["opponent_goal", "own_goal"], ownGoalsByPlayer);
  return {
    forSeconds: teamScore === null || forSeconds.length === teamScore ? forSeconds : null,
    againstSeconds: opponentScore === null || againstSeconds.length === opponentScore ? againstSeconds : null,
  };
}

/** Which of `goalSeconds` happened while the player held at least one
 * matching playing-time segment — i.e. goals scored/conceded while they
 * were actually on the pitch. `liveCurrentSecond` closes off segments
 * still open on a live match; pass `null` for finished matches. */
export function countGoalsWhileOnPitch(
  goalSeconds: number[],
  segments: Segment[],
  liveCurrentSecond: number | null
): number {
  return goalSeconds.filter((second) =>
    segments.some((segment) => {
      const end = segment.endSecond ?? liveCurrentSecond ?? Infinity;
      return second >= segment.startSecond && second < end;
    })
  ).length;
}

/**
 * Splits a player's corrected card total into cards shown on the pitch and
 * from the bench, by checking each card event's second against their
 * playing-time segments (end included: a red card closes the segment at
 * that very second). Cards added by a correction, with no event, count as
 * bench cards only for a player who never played.
 */
export function splitCards(
  cardSeconds: number[],
  total: number,
  segments: Segment[],
  secondsPlayed: number
): { onPitch: number; bench: number } {
  const kept = [...cardSeconds].sort((a, b) => a - b).slice(0, total);
  const onPitch = kept.filter((second) =>
    segments.some((s) => second >= s.startSecond && second <= (s.endSecond ?? Infinity))
  ).length;
  const bench = kept.length - onPitch;
  const untimed = total - kept.length;
  return secondsPlayed > 0 ? { onPitch: onPitch + untimed, bench } : { onPitch, bench: bench + untimed };
}

/** Goals per team and match assumed when there's no league table to go by. */
export const DEFAULT_LEAGUE_GOALS = 2.9;
/** A rival's short record is blended with the league average as if it had
 * played this many extra average matches. */
const PRIOR_MATCHES = 2;

export interface RivalRecord {
  goalsFor: number;
  goalsAgainst: number;
  played: number;
}

/** Goals a team is expected to score/concede over a whole match against
 * this rival, from its league record (our own games against it already
 * taken out), shrunk towards the league average while it's short. No
 * record: the league average. */
export function expectedGoals(
  rival: RivalRecord | null,
  leagueGoals: number
): { expectedFor: number; expectedAgainst: number } {
  if (!rival) return { expectedFor: leagueGoals, expectedAgainst: leagueGoals };
  const weight = Math.max(0, rival.played) + PRIOR_MATCHES;
  return {
    expectedFor: (Math.max(0, rival.goalsAgainst) + PRIOR_MATCHES * leagueGoals) / weight,
    expectedAgainst: (Math.max(0, rival.goalsFor) + PRIOR_MATCHES * leagueGoals) / weight,
  };
}

/** "Fontanería R.Rubio" and "FONTANERÍA R. RUBIO" are the same team. */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
