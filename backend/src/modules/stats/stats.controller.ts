import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { averageRating, computeMatchRating, countGoalsWhileOnPitch } from "./playerRating";

/** Composite key for per-player-per-match maps below — the season totals
 * (secondsByPlayer, countersByPlayer) aren't enough to rate a single
 * match, since the rating's time-normalization needs that match's own
 * seconds played, not the season sum. */
function playerMatchKey(playerId: string, matchId: string): string {
  return `${playerId}::${matchId}`;
}

interface Counters {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltyGoals: number;
  penaltiesWon: number;
}

function emptyCounters(): Counters {
  return { goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0, penaltyGoals: 0, penaltiesWon: 0 };
}

export async function getSeasonStats(req: Request, res: Response) {
  const seasonId = req.params.seasonId;

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) {
    throw new HttpError(404, "Temporada no encontrada");
  }

  const finishedMatches = await prisma.match.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true, teamScore: true, opponentScore: true },
  });
  const matchIds = finishedMatches.map((m) => m.id);
  const matchesById = new Map(finishedMatches.map((m) => [m.id, m]));

  const [playerStats, segments, players, goalEvents] = await Promise.all([
    prisma.matchPlayerStat.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.playingTimeSegment.findMany({
      where: { matchId: { in: matchIds }, endSecond: { not: null } },
    }),
    prisma.player.findMany({ where: { active: true } }),
    prisma.matchEvent.findMany({
      // "goal"/"penalty_goal" count for us, "opponent_goal"/"own_goal"
      // against — see SCORE_FIELD_BY_EVENT_TYPE in matches.controller.ts.
      where: { matchId: { in: matchIds }, type: { in: ["goal", "penalty_goal", "opponent_goal", "own_goal"] } },
      select: { matchId: true, type: true, second: true },
    }),
  ]);

  // Same live-vs-manual-entry gap as the single-match rating: a goal only
  // has a timestamp when it was logged live, so matches scored entirely
  // via direct stat corrections fall back to the whole-match scoreline.
  const goalForSecondsByMatch = new Map<string, number[]>();
  const goalAgainstSecondsByMatch = new Map<string, number[]>();
  for (const event of goalEvents) {
    const bucket =
      event.type === "goal" || event.type === "penalty_goal" ? goalForSecondsByMatch : goalAgainstSecondsByMatch;
    if (!bucket.has(event.matchId)) bucket.set(event.matchId, []);
    bucket.get(event.matchId)!.push(event.second);
  }

  const secondsByPlayer = new Map<string, number>();
  const appearancesByPlayer = new Map<string, Set<string>>();
  // Per-match breakdown (not just the season sum) — a match rating needs
  // that match's own seconds played, so this indexes by player+match
  // instead of just by player.
  const secondsByPlayerMatch = new Map<string, number>();
  // Raw segments per player+match, needed to place a goal's timestamp
  // against this player's specific on-pitch windows (secondsByPlayerMatch
  // alone only has the total, not when it happened).
  const segmentsByPlayerMatch = new Map<string, { startSecond: number; endSecond: number | null }[]>();
  for (const segment of segments) {
    secondsByPlayer.set(
      segment.playerId,
      (secondsByPlayer.get(segment.playerId) ?? 0) + (segment.endSecond! - segment.startSecond)
    );
    if (!appearancesByPlayer.has(segment.playerId)) appearancesByPlayer.set(segment.playerId, new Set());
    appearancesByPlayer.get(segment.playerId)!.add(segment.matchId);

    const key = playerMatchKey(segment.playerId, segment.matchId);
    secondsByPlayerMatch.set(
      key,
      (secondsByPlayerMatch.get(key) ?? 0) + (segment.endSecond! - segment.startSecond)
    );
    if (!segmentsByPlayerMatch.has(key)) segmentsByPlayerMatch.set(key, []);
    segmentsByPlayerMatch.get(key)!.push(segment);
  }

  const countersByPlayer = new Map<string, Counters>();
  // `MatchPlayerStat` is already unique per (matchId, playerId), so this is
  // a direct lookup, not an aggregation like `countersByPlayer` above.
  const statsByPlayerMatch = new Map<string, Counters>();
  // Matches with a stat line, played or not: a player booked from the
  // bench has a rating for that match despite no playing time.
  const statMatchIdsByPlayer = new Map<string, Set<string>>();
  for (const stat of playerStats) {
    if (!statMatchIdsByPlayer.has(stat.playerId)) statMatchIdsByPlayer.set(stat.playerId, new Set());
    statMatchIdsByPlayer.get(stat.playerId)!.add(stat.matchId);

    const existing = countersByPlayer.get(stat.playerId) ?? emptyCounters();
    existing.goals += stat.goals;
    existing.assists += stat.assists;
    existing.yellowCards += stat.yellowCards;
    existing.redCards += stat.redCards;
    existing.ownGoals += stat.ownGoals;
    existing.penaltyGoals += stat.penaltyGoals;
    existing.penaltiesWon += stat.penaltiesWon;
    countersByPlayer.set(stat.playerId, existing);

    statsByPlayerMatch.set(playerMatchKey(stat.playerId, stat.matchId), stat);
  }

  const rows = players
    .map((player) => {
      const secondsPlayed = secondsByPlayer.get(player.id) ?? 0;
      const appearedMatchIds = appearancesByPlayer.get(player.id) ?? new Set<string>();
      const appearances = appearedMatchIds.size;
      const counters = countersByPlayer.get(player.id) ?? emptyCounters();

      // Season "promedio" is the mean of this player's per-match ratings
      // (not the formula re-applied to season totals) — a good early
      // match and a quiet late one should average out the same way two
      // separate performances would, not blend into one combined stat
      // line with a different (and less meaningful) time normalization.
      // A match where they were only booked from the bench is rated (and
      // averaged in) but isn't an appearance: they didn't play it.
      const ratedMatchIds = new Set([...appearedMatchIds, ...(statMatchIdsByPlayer.get(player.id) ?? [])]);
      const isGoalkeeper = player.position === "Portero" || player.secondaryPosition === "Portero";
      const matchRatings = [...ratedMatchIds].map((matchId) => {
        const key = playerMatchKey(player.id, matchId);
        const matchStat = statsByPlayerMatch.get(key);
        const matchSecondsPlayed = secondsByPlayerMatch.get(key) ?? 0;
        const match = matchesById.get(matchId);
        const playerSegments = segmentsByPlayerMatch.get(key) ?? [];

        const goalForSeconds = goalForSecondsByMatch.get(matchId) ?? [];
        const goalsForWhileOnPitch =
          goalForSeconds.length === 0
            ? matchSecondsPlayed > 0
              ? match?.teamScore ?? 0
              : 0
            : countGoalsWhileOnPitch(goalForSeconds, playerSegments, null);

        const goalAgainstSeconds = goalAgainstSecondsByMatch.get(matchId) ?? [];
        const goalsAgainstWhileOnPitch =
          goalAgainstSeconds.length === 0
            ? matchSecondsPlayed > 0
              ? match?.opponentScore ?? 0
              : 0
            : countGoalsWhileOnPitch(goalAgainstSeconds, playerSegments, null);

        return computeMatchRating({
          goals: matchStat?.goals ?? 0,
          penaltyGoals: matchStat?.penaltyGoals ?? 0,
          penaltiesWon: matchStat?.penaltiesWon ?? 0,
          assists: matchStat?.assists ?? 0,
          yellowCards: matchStat?.yellowCards ?? 0,
          redCards: matchStat?.redCards ?? 0,
          ownGoals: matchStat?.ownGoals ?? 0,
          secondsPlayed: matchSecondsPlayed,
          goalsForWhileOnPitch,
          goalsAgainstWhileOnPitch,
          isGoalkeeper,
        });
      });

      return {
        playerId: player.id,
        player,
        appearances,
        secondsPlayed,
        avgSecondsPerAppearance: appearances > 0 ? Math.round(secondsPlayed / appearances) : 0,
        avgRating: averageRating(matchRatings),
        ...counters,
      };
    })
    .sort((a, b) => b.secondsPlayed - a.secondsPlayed);

  res.json({ season, matchesPlayed: matchIds.length, players: rows });
}
