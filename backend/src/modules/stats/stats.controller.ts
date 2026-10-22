import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { averageRating } from "./playerRating";
import { rateMatches } from "./matchRatings";

interface Counters {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltyGoals: number;
  penaltiesWon: number;
  keyActions: number;
  keyErrors: number;
}

function emptyCounters(): Counters {
  return {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    penaltyGoals: 0,
    penaltiesWon: 0,
    keyActions: 0,
    keyErrors: 0,
  };
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

  const [playerStats, segments, players, ratingsByMatch] = await Promise.all([
    prisma.matchPlayerStat.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.playingTimeSegment.findMany({
      where: { matchId: { in: matchIds }, endSecond: { not: null } },
    }),
    prisma.player.findMany({ where: { active: true } }),
    rateMatches(matchIds),
  ]);

  const secondsByPlayer = new Map<string, number>();
  const appearancesByPlayer = new Map<string, Set<string>>();
  for (const segment of segments) {
    secondsByPlayer.set(
      segment.playerId,
      (secondsByPlayer.get(segment.playerId) ?? 0) + (segment.endSecond! - segment.startSecond)
    );
    if (!appearancesByPlayer.has(segment.playerId)) appearancesByPlayer.set(segment.playerId, new Set());
    appearancesByPlayer.get(segment.playerId)!.add(segment.matchId);
  }

  const countersByPlayer = new Map<string, Counters>();
  for (const stat of playerStats) {
    const existing = countersByPlayer.get(stat.playerId) ?? emptyCounters();
    for (const field of Object.keys(existing) as (keyof Counters)[]) existing[field] += stat[field];
    countersByPlayer.set(stat.playerId, existing);
  }

  const rows = players
    .map((player) => {
      const secondsPlayed = secondsByPlayer.get(player.id) ?? 0;
      const appearances = appearancesByPlayer.get(player.id)?.size ?? 0;
      return {
        playerId: player.id,
        player,
        appearances,
        secondsPlayed,
        avgSecondsPerAppearance: appearances > 0 ? Math.round(secondsPlayed / appearances) : 0,
        // Season "promedio" is the mean of this player's per-match ratings
        // (not the formula re-applied to season totals) — a good early
        // match and a quiet late one should average out the same way two
        // separate performances would. A match where they were only booked
        // from the bench is rated (and averaged in) but isn't an
        // appearance: they didn't play it.
        avgRating: averageRating([...ratingsByMatch.values()].map((ratings) => ratings.get(player.id) ?? null)),
        ...(countersByPlayer.get(player.id) ?? emptyCounters()),
      };
    })
    .sort((a, b) => b.secondsPlayed - a.secondsPlayed);

  res.json({ season, matchesPlayed: matchIds.length, players: rows });
}
