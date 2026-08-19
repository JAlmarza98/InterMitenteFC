import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { averageRating, computeMatchRating } from "./playerRating";

/** Composite key for per-player-per-match maps below — the season totals
 * (secondsByPlayer, countersByPlayer) aren't enough to rate a single
 * match, since the rating's time-normalization needs that match's own
 * seconds played, not the season sum. */
function playerMatchKey(playerId: string, matchId: string): string {
  return `${playerId}::${matchId}`;
}

export async function getSeasonStats(req: Request, res: Response) {
  const seasonId = req.params.seasonId;

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) {
    throw new HttpError(404, "Temporada no encontrada");
  }

  const finishedMatches = await prisma.match.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true },
  });
  const matchIds = finishedMatches.map((m) => m.id);

  const [playerStats, segments, players] = await Promise.all([
    prisma.matchPlayerStat.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.playingTimeSegment.findMany({
      where: { matchId: { in: matchIds }, endSecond: { not: null } },
    }),
    prisma.player.findMany({ where: { active: true } }),
  ]);

  const secondsByPlayer = new Map<string, number>();
  const appearancesByPlayer = new Map<string, Set<string>>();
  // Per-match breakdown (not just the season sum) — a match rating needs
  // that match's own seconds played, so this indexes by player+match
  // instead of just by player.
  const secondsByPlayerMatch = new Map<string, number>();
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
  }

  const countersByPlayer = new Map<
    string,
    { goals: number; assists: number; yellowCards: number; redCards: number; ownGoals: number }
  >();
  // `MatchPlayerStat` is already unique per (matchId, playerId), so this is
  // a direct lookup, not an aggregation like `countersByPlayer` above.
  const statsByPlayerMatch = new Map<
    string,
    { goals: number; assists: number; yellowCards: number; redCards: number; ownGoals: number }
  >();
  for (const stat of playerStats) {
    const existing = countersByPlayer.get(stat.playerId) ?? {
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      ownGoals: 0,
    };
    existing.goals += stat.goals;
    existing.assists += stat.assists;
    existing.yellowCards += stat.yellowCards;
    existing.redCards += stat.redCards;
    existing.ownGoals += stat.ownGoals;
    countersByPlayer.set(stat.playerId, existing);

    statsByPlayerMatch.set(playerMatchKey(stat.playerId, stat.matchId), stat);
  }

  const rows = players
    .map((player) => {
      const secondsPlayed = secondsByPlayer.get(player.id) ?? 0;
      const appearedMatchIds = appearancesByPlayer.get(player.id) ?? new Set<string>();
      const appearances = appearedMatchIds.size;
      const counters = countersByPlayer.get(player.id) ?? {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ownGoals: 0,
      };

      // Season "promedio" is the mean of this player's per-match ratings
      // (not the formula re-applied to season totals) — a good early
      // match and a quiet late one should average out the same way two
      // separate performances would, not blend into one combined stat
      // line with a different (and less meaningful) time normalization.
      const matchRatings = [...appearedMatchIds].map((matchId) => {
        const key = playerMatchKey(player.id, matchId);
        const matchStat = statsByPlayerMatch.get(key);
        return computeMatchRating({
          goals: matchStat?.goals ?? 0,
          assists: matchStat?.assists ?? 0,
          yellowCards: matchStat?.yellowCards ?? 0,
          redCards: matchStat?.redCards ?? 0,
          ownGoals: matchStat?.ownGoals ?? 0,
          secondsPlayed: secondsByPlayerMatch.get(key) ?? 0,
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
