import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

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
  for (const segment of segments) {
    secondsByPlayer.set(
      segment.playerId,
      (secondsByPlayer.get(segment.playerId) ?? 0) + (segment.endSecond! - segment.startSecond)
    );
    if (!appearancesByPlayer.has(segment.playerId)) appearancesByPlayer.set(segment.playerId, new Set());
    appearancesByPlayer.get(segment.playerId)!.add(segment.matchId);
  }

  const countersByPlayer = new Map<
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
  }

  const rows = players
    .map((player) => {
      const secondsPlayed = secondsByPlayer.get(player.id) ?? 0;
      const appearances = appearancesByPlayer.get(player.id)?.size ?? 0;
      const counters = countersByPlayer.get(player.id) ?? {
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ownGoals: 0,
      };
      return {
        playerId: player.id,
        player,
        appearances,
        secondsPlayed,
        avgSecondsPerAppearance: appearances > 0 ? Math.round(secondsPlayed / appearances) : 0,
        ...counters,
      };
    })
    .sort((a, b) => b.secondsPlayed - a.secondsPlayed);

  res.json({ season, matchesPlayed: matchIds.length, players: rows });
}
