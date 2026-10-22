import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import {
  closeOpenClockState,
  computeLiveElapsedSeconds,
  getEventStamp,
  segmentDurationSeconds,
} from "../matchClock/matchClock.service";
import { broadcastMatchUpdate } from "../liveUpdates/liveUpdates.service";
import { rateMatches } from "../stats/matchRatings";
import { paginationSchema, toSkipTake } from "../../utils/pagination";
import { FORMATION_PRESETS } from "./formationPresets";

const matchSchema = z.object({
  seasonId: z.string().uuid().nullable().optional(),
  opponent: z.string().min(1).max(200),
  matchDate: z.coerce.date(),
  homeAway: z.enum(["home", "away"]),
  competition: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  periodLengthMinutes: z.number().int().positive().optional(),
});

const updateMatchSchema = matchSchema.partial().extend({
  teamScore: z.number().int().nonnegative().nullable().optional(),
  opponentScore: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["scheduled", "live", "finished"]).optional(),
});

const listQuerySchema = paginationSchema.extend({
  seasonId: z.string().uuid().optional(),
  status: z.enum(["scheduled", "live", "finished"]).optional(),
});

// Fútbol 7: the starting XI is 7 players, no more, no less — also the cap
// on how many can ever be on the pitch at once during the match.
const SQUAD_SIZE = 7;

const squadSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.string().uuid(),
      isStarter: z.boolean().default(false),
    })
  ),
});

const formationSchema = z.object({
  presetId: z.string().refine((id) => id in FORMATION_PRESETS, { message: "Formación no reconocida" }),
  slots: z.array(
    z.object({
      slotKey: z.string(),
      playerId: z.string().uuid(),
      subPlayerIds: z
        .array(z.string().uuid())
        .default([])
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Suplentes duplicados en la misma posición",
        }),
    })
  ),
});

const playerStatSchema = z.object({
  goals: z.number().int().nonnegative().optional(),
  assists: z.number().int().nonnegative().optional(),
  yellowCards: z.number().int().min(0).max(2).optional(),
  redCards: z.number().int().min(0).max(1).optional(),
  ownGoals: z.number().int().nonnegative().optional(),
  penaltyGoals: z.number().int().nonnegative().optional(),
  penaltiesWon: z.number().int().nonnegative().optional(),
  keyActions: z.number().int().nonnegative().optional(),
  keyErrors: z.number().int().nonnegative().optional(),
});
const STAT_FIELDS = playerStatSchema.keyof().options;

const STAT_EVENT_TYPES = [
  "goal",
  "assist",
  "yellow_card",
  "red_card",
  "own_goal",
  "penalty_goal",
  "penalty_won",
  "key_action",
  "key_error",
] as const;
type StatEventType = (typeof STAT_EVENT_TYPES)[number];
const LOGGABLE_EVENT_TYPES = [...STAT_EVENT_TYPES, "opponent_goal"] as const;

const matchEventSchema = z
  .object({
    playerId: z.string().uuid().optional(),
    type: z.enum(LOGGABLE_EVENT_TYPES),
  })
  .refine((data) => data.type === "opponent_goal" || !!data.playerId, {
    message: "playerId es obligatorio para este tipo de evento",
    path: ["playerId"],
  });

type StatField = keyof z.infer<typeof playerStatSchema>;

// A penalty goal is still a goal: it bumps the scorer's `goals` too, so
// top-scorer totals and the rating keep counting it, and `penaltyGoals`
// only records how it was scored.
const STAT_FIELDS_BY_EVENT_TYPE: Record<StatEventType, StatField[]> = {
  goal: ["goals"],
  assist: ["assists"],
  yellow_card: ["yellowCards"],
  red_card: ["redCards"],
  own_goal: ["ownGoals"],
  penalty_goal: ["goals", "penaltyGoals"],
  penalty_won: ["penaltiesWon"],
  key_action: ["keyActions"],
  key_error: ["keyErrors"],
};

// A "goal" adds to our score; an "own_goal" (autogol) is put into our own
// net by one of our players, so it counts for the opponent instead.
const SCORE_FIELD_BY_EVENT_TYPE: Partial<Record<StatEventType, "teamScore" | "opponentScore">> = {
  goal: "teamScore",
  penalty_goal: "teamScore",
  own_goal: "opponentScore",
};

export async function listMatches(req: Request, res: Response) {
  const { seasonId, status, ...pagination } = listQuerySchema.parse(req.query);
  const where = { seasonId, status };
  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy: { matchDate: "desc" },
      ...toSkipTake(pagination),
    }),
    pagination.limit ? prisma.match.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({ matches, total });
}

export async function getMatch(req: Request, res: Response) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      squad: { include: { player: true } },
    },
  });
  res.json({ match });
}

export async function createMatch(req: Request, res: Response) {
  const data = matchSchema.parse(req.body);
  const match = await prisma.match.create({
    data: { ...data, createdByUserId: req.user!.id },
  });
  res.status(201).json({ match });
}

// Match metadata (opponent, date, competition, notes...) stays a coach
// action, but the status and the score are the official record of what
// happened — only admin can move those, regardless of which fields a
// given PATCH request happens to touch.
const ADMIN_ONLY_MATCH_FIELDS = ["status", "teamScore", "opponentScore"] as const;

export async function updateMatch(req: Request, res: Response) {
  const data = updateMatchSchema.parse(req.body);
  const matchId = req.params.id;

  const touchesAdminOnlyField = ADMIN_ONLY_MATCH_FIELDS.some((field) => data[field] !== undefined);
  if (touchesAdminOnlyField && req.user!.role !== "admin") {
    throw new HttpError(403, "Solo un administrador puede cambiar el estado o el marcador del partido");
  }

  if (data.periodLengthMinutes !== undefined) {
    const hasStartedPeriod = await prisma.matchPeriod.findFirst({
      where: { matchId, startedAt: { not: null } },
      select: { id: true },
    });
    if (hasStartedPeriod) {
      throw new HttpError(
        400,
        "No se puede cambiar la duración del período: el partido ya tiene tiempo registrado"
      );
    }
  }

  if (data.status === "finished") {
    const current = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { status: true },
    });
    if (current.status !== "finished") {
      const match = await prisma.$transaction(async (tx) => {
        await closeOpenClockState(tx, matchId, new Date(), req.user!.id);
        return tx.match.update({ where: { id: matchId }, data });
      });
      broadcastMatchUpdate(matchId);
      res.json({ match });
      return;
    }
  }

  const match = await prisma.match.update({ where: { id: matchId }, data });
  // Status/score are the fields a live viewer cares about; skip the
  // broadcast for edits to e.g. opponent/notes so an unrelated correction
  // doesn't trigger every connected client to refetch for nothing.
  if (touchesAdminOnlyField) broadcastMatchUpdate(matchId);
  res.json({ match });
}

export async function deleteMatch(req: Request, res: Response) {
  await prisma.match.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function putSquad(req: Request, res: Response) {
  const { players } = squadSchema.parse(req.body);
  const matchId = req.params.id;

  const startersCount = players.filter((p) => p.isStarter).length;
  if (startersCount !== SQUAD_SIZE) {
    throw new HttpError(400, `El equipo titular debe tener exactamente ${SQUAD_SIZE} jugadores (fútbol 7)`);
  }

  await prisma.$transaction([
    prisma.matchSquad.deleteMany({ where: { matchId } }),
    prisma.matchSquad.createMany({
      data: players.map((p) => ({ matchId, playerId: p.playerId, isStarter: p.isStarter })),
    }),
  ]);

  const squad = await prisma.matchSquad.findMany({
    where: { matchId },
    include: { player: true },
  });
  res.json({ squad });
}

const formationInclude = {
  slots: {
    include: {
      player: true,
      substitutes: { include: { player: true } },
    },
  },
} satisfies Prisma.MatchFormationInclude;

export async function getFormation(req: Request, res: Response) {
  const formation = await prisma.matchFormation.findUnique({
    where: { matchId: req.params.id },
    include: formationInclude,
  });
  res.json({ formation });
}

export async function putFormation(req: Request, res: Response) {
  const data = formationSchema.parse(req.body);
  const matchId = req.params.id;
  const preset = FORMATION_PRESETS[data.presetId];

  // Structural check: exactly the preset's slot keys, no gaps/extras/dupes.
  const sentKeys = [...data.slots.map((s) => s.slotKey)].sort();
  const expectedKeys = [...preset.slotKeys].sort();
  if (data.slots.length !== SQUAD_SIZE || sentKeys.join() !== expectedKeys.join()) {
    throw new HttpError(400, `La formación debe cubrir exactamente las ${SQUAD_SIZE} posiciones de ${preset.id}`);
  }

  // Every starter used exactly once, no gaps.
  const playerIds = data.slots.map((s) => s.playerId);
  if (new Set(playerIds).size !== SQUAD_SIZE) {
    throw new HttpError(400, "Cada titular debe ocupar exactamente una posición, sin repetirse");
  }

  const squad = await prisma.matchSquad.findMany({ where: { matchId } });
  const starterIds = new Set(squad.filter((s) => s.isStarter).map((s) => s.playerId));
  const benchIds = new Set(squad.filter((s) => !s.isStarter).map((s) => s.playerId));

  if (!playerIds.every((id) => starterIds.has(id))) {
    throw new HttpError(400, "Todas las posiciones deben asignarse a un titular de la convocatoria");
  }
  const allSubIds = data.slots.flatMap((s) => s.subPlayerIds);
  if (!allSubIds.every((id) => benchIds.has(id))) {
    throw new HttpError(400, "Los posibles cambios deben ser jugadores convocados en el banquillo");
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchFormation.deleteMany({ where: { matchId } });
    await tx.matchFormation.create({
      data: {
        matchId,
        presetId: data.presetId,
        slots: {
          create: data.slots.map((s) => ({
            slotKey: s.slotKey,
            playerId: s.playerId,
            substitutes: { create: s.subPlayerIds.map((playerId) => ({ playerId })) },
          })),
        },
      },
    });
  });

  const formation = await prisma.matchFormation.findUnique({
    where: { matchId },
    include: formationInclude,
  });
  res.json({ formation });
}

// Deliberately not limited to the match's squad: this is the admin's
// after-the-fact correction tool, and a player who ended up playing without
// having been called up (a late addition nobody entered in the convocatoria)
// still needs their numbers recorded somewhere.
export async function upsertPlayerStat(req: Request, res: Response) {
  const data = playerStatSchema.parse(req.body);
  const matchId = req.params.id;
  const playerId = req.params.playerId;

  const stat = await prisma.$transaction(async (tx) => {
    const [match, player, existing] = await Promise.all([
      tx.match.findUnique({ where: { id: matchId }, select: { id: true } }),
      tx.player.findUnique({ where: { id: playerId }, select: { id: true } }),
      tx.matchPlayerStat.findUnique({
        where: { matchId_playerId: { matchId, playerId } },
        select: { goals: true, penaltyGoals: true },
      }),
    ]);
    if (!match) throw new HttpError(404, "Partido no encontrado");
    if (!player) throw new HttpError(404, "Jugador no encontrado");

    // Penalty goals are a subset of goals, so the two have to stay
    // consistent whichever of them this (partial) update touches.
    const goals = data.goals ?? existing?.goals ?? 0;
    const penaltyGoals = data.penaltyGoals ?? existing?.penaltyGoals ?? 0;
    if (penaltyGoals > goals) {
      throw new HttpError(400, "Los goles de penalti no pueden superar a los goles totales del jugador");
    }

    return tx.matchPlayerStat.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      create: { matchId, playerId, ...data },
      update: data,
    });
  });
  broadcastMatchUpdate(matchId);
  res.json({ stat });
}

function hasAnyStat(stat: Record<StatField, number>): boolean {
  return STAT_FIELDS.some((field) => stat[field] > 0);
}

export async function getMatchStats(req: Request, res: Response) {
  const matchId = req.params.id;

  const [match, squad, playerStats, segments, ratingsByMatch] = await Promise.all([
    prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } }),
    prisma.matchSquad.findMany({ where: { matchId }, include: { player: true } }),
    prisma.matchPlayerStat.findMany({ where: { matchId } }),
    prisma.playingTimeSegment.findMany({ where: { matchId } }),
    rateMatches([matchId]),
  ]);
  const ratings = ratingsByMatch.get(matchId);

  // An admin can record stats/playing time for a player who wasn't called
  // up (see upsertPlayerStat), so the squad alone no longer covers everyone
  // with numbers in this match. Anyone outside it who has playing time or a
  // non-zero stat is listed too, after the squad; an all-zero stat line
  // (e.g. a correction set back to 0) doesn't keep them on the list.
  const squadPlayerIds = new Set(squad.map((entry) => entry.playerId));
  const extraPlayerIds = new Set<string>();
  for (const segment of segments) {
    if (!squadPlayerIds.has(segment.playerId)) extraPlayerIds.add(segment.playerId);
  }
  for (const stat of playerStats) {
    if (!squadPlayerIds.has(stat.playerId) && hasAnyStat(stat)) extraPlayerIds.add(stat.playerId);
  }
  const extraPlayers =
    extraPlayerIds.size > 0
      ? await prisma.player.findMany({
          where: { id: { in: [...extraPlayerIds] } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      : [];
  const entries = [
    ...squad.map((entry) => ({
      playerId: entry.playerId,
      player: entry.player,
      isStarter: entry.isStarter,
      inSquad: true,
    })),
    ...extraPlayers.map((player) => ({ playerId: player.id, player, isStarter: false, inSquad: false })),
  ];

  const liveCurrentSecond = match.status === "live" ? await computeLiveElapsedSeconds(matchId) : null;

  const secondsByPlayer = new Map<string, number>();
  for (const segment of segments) {
    const duration = segmentDurationSeconds(segment, liveCurrentSecond);
    secondsByPlayer.set(segment.playerId, (secondsByPlayer.get(segment.playerId) ?? 0) + duration);
  }
  const statsByPlayer = new Map(playerStats.map((s) => [s.playerId, s]));

  const players = entries.map((entry) => {
    const stat = statsByPlayer.get(entry.playerId);
    return {
      ...entry,
      secondsPlayed: secondsByPlayer.get(entry.playerId) ?? 0,
      ...Object.fromEntries(STAT_FIELDS.map((field) => [field, stat?.[field] ?? 0])),
      rating: ratings?.get(entry.playerId) ?? null,
    };
  });

  res.json({ players });
}

export async function logMatchEvent(req: Request, res: Response) {
  const { playerId, type } = matchEventSchema.parse(req.body);
  const matchId = req.params.id;

  const { periodType, second } = await getEventStamp(matchId);

  if (type === "opponent_goal") {
    const [match, event] = await prisma.$transaction(async (tx) => {
      // Atomic SQL increment (vs. read-then-write) so two near-simultaneous
      // goals can't both read the same starting value and lose one.
      // COALESCE handles the score still being NULL (match not yet scored).
      await tx.$executeRaw`UPDATE "Match" SET "opponentScore" = COALESCE("opponentScore", 0) + 1 WHERE id = ${matchId}`;
      const updatedMatch = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
      const createdEvent = await tx.matchEvent.create({
        data: { matchId, type, periodType, second, createdByUserId: req.user!.id },
        include: { player: true, relatedPlayer: true },
      });
      return [updatedMatch, createdEvent] as const;
    });

    broadcastMatchUpdate(matchId);
    res.status(201).json({ match, event });
    return;
  }

  const fields = STAT_FIELDS_BY_EVENT_TYPE[type as StatEventType];
  const scoreField = SCORE_FIELD_BY_EVENT_TYPE[type as StatEventType];

  const [match, stat, event] = await prisma.$transaction(async (tx) => {
    if (scoreField) {
      const column = Prisma.raw(`"${scoreField}"`);
      await tx.$executeRaw`UPDATE "Match" SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ${matchId}`;
    }
    const updatedMatch = scoreField ? await tx.match.findUniqueOrThrow({ where: { id: matchId } }) : null;
    const upsertedStat = await tx.matchPlayerStat.upsert({
      where: { matchId_playerId: { matchId, playerId: playerId! } },
      create: { matchId, playerId: playerId!, ...Object.fromEntries(fields.map((f) => [f, 1])) },
      update: Object.fromEntries(fields.map((f) => [f, { increment: 1 }])),
    });
    const createdEvent = await tx.matchEvent.create({
      data: { matchId, playerId, type, periodType, second, createdByUserId: req.user!.id },
      include: { player: true },
    });

    // A red card sends the player off for the rest of the match: close
    // their playing-time segment right now instead of leaving it open (and
    // ticking) until someone remembers to substitute them out.
    if (type === "red_card") {
      await tx.playingTimeSegment.updateMany({
        where: { matchId, playerId: playerId!, endSecond: null },
        data: { endSecond: second, endedAt: new Date() },
      });
    }

    return [updatedMatch, upsertedStat, createdEvent] as const;
  });

  broadcastMatchUpdate(matchId);
  res.status(201).json({ match, stat, event });
}

// Which events add to each total: the inverse of the two maps above.
const SCORE_EVENT_TYPES = {
  teamScore: ["goal", "penalty_goal"],
  opponentScore: ["opponent_goal", "own_goal"],
} as const;
const eventTypesCounting = (field: StatField) =>
  STAT_EVENT_TYPES.filter((type) => STAT_FIELDS_BY_EVENT_TYPE[type].includes(field));

/** Undoes a mis-tapped action: deletes the event and takes it back off the
 * totals — but only off the totals that still include it. An action an
 * admin already corrected by hand (stat or score fixed, event left behind)
 * only has its stale history entry removed, instead of being subtracted a
 * second time. Undoing a red card during the match puts the player back on
 * the pitch: they never actually left it. */
export async function deleteMatchEvent(req: Request, res: Response) {
  const { id: matchId, eventId } = req.params;
  const event = await prisma.matchEvent.findFirst({ where: { id: eventId, matchId } });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  const type = event.type as (typeof LOGGABLE_EVENT_TYPES)[number];
  if (!LOGGABLE_EVENT_TYPES.includes(type)) {
    throw new HttpError(400, "Los cambios y los inicios o finales de parte no se pueden borrar");
  }
  if (req.user!.role !== "admin") {
    const { status } = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } });
    if (status !== "live") {
      throw new HttpError(403, "Solo un administrador puede borrar acciones de un partido que no está en juego");
    }
  }

  const match = await prisma.$transaction(async (tx) => {
    const scoreField = type === "opponent_goal" ? "opponentScore" : SCORE_FIELD_BY_EVENT_TYPE[type];
    if (scoreField) {
      const logged = await tx.matchEvent.count({
        where: { matchId, type: { in: [...SCORE_EVENT_TYPES[scoreField]] } },
      });
      const column = Prisma.raw(`"${scoreField}"`);
      await tx.$executeRaw`UPDATE "Match" SET ${column} = ${column} - 1 WHERE id = ${matchId} AND ${column} >= ${logged}`;
    }
    if (event.playerId && type !== "opponent_goal") {
      for (const field of STAT_FIELDS_BY_EVENT_TYPE[type]) {
        const logged = await tx.matchEvent.count({
          where: { matchId, playerId: event.playerId, type: { in: eventTypesCounting(field) } },
        });
        const column = Prisma.raw(`"${field}"`);
        await tx.$executeRaw`UPDATE "MatchPlayerStat" SET ${column} = ${column} - 1 WHERE "matchId" = ${matchId} AND "playerId" = ${event.playerId} AND ${column} >= ${logged}`;
      }
    }
    if (type === "red_card" && event.playerId) {
      await reopenSentOffSegment(tx, matchId, event.playerId, event.second);
    }
    await tx.matchEvent.delete({ where: { id: eventId } });
    return scoreField ? tx.match.findUniqueOrThrow({ where: { id: matchId } }) : null;
  });

  broadcastMatchUpdate(matchId);
  res.json({ match });
}

/** Reopens the playing time a red card closed at `second` (see
 * logMatchEvent), live matches only — once finished, the admin fixes the
 * minutes by hand, since nobody knows how long they would have played.
 * Segments stay open across half-time, so the player simply keeps
 * accruing time from where the card cut it. */
async function reopenSentOffSegment(tx: Prisma.TransactionClient, matchId: string, playerId: string, second: number) {
  const { status } = await tx.match.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } });
  if (status !== "live") return;
  const [closed, alreadyOn, onPitch] = await Promise.all([
    tx.playingTimeSegment.findFirst({ where: { matchId, playerId, endSecond: second }, orderBy: { createdAt: "desc" } }),
    tx.playingTimeSegment.count({ where: { matchId, playerId, endSecond: null } }),
    tx.playingTimeSegment.count({ where: { matchId, endSecond: null } }),
  ]);
  if (!closed || alreadyOn > 0 || onPitch >= SQUAD_SIZE) return;
  await tx.playingTimeSegment.update({ where: { id: closed.id }, data: { endSecond: null, endedAt: null } });
}

const topPlayersSchema = z.object({
  /** Best first; up to three. */
  playerIds: z
    .array(z.string().uuid())
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Un jugador no puede repetirse en el top 3" }),
});

export async function getTopPlayers(req: Request, res: Response) {
  const top = await prisma.matchTopPlayer.findMany({ where: { matchId: req.params.id }, orderBy: { rank: "asc" } });
  res.json({ playerIds: top.map((t) => t.playerId) });
}

/** One top 3 per match, shared by every admin: the last one saved stands. */
export async function putTopPlayers(req: Request, res: Response) {
  const { playerIds } = topPlayersSchema.parse(req.body);
  const matchId = req.params.id;

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!match) throw new HttpError(404, "Partido no encontrado");
  if (match.status !== "finished") throw new HttpError(400, "El top 3 se elige con el partido finalizado");
  const played = await prisma.playingTimeSegment.findMany({
    where: { matchId, playerId: { in: playerIds } },
    distinct: ["playerId"],
    select: { playerId: true },
  });
  if (played.length !== playerIds.length) {
    throw new HttpError(400, "Solo pueden estar en el top 3 jugadores que jugaron el partido");
  }

  await prisma.$transaction([
    prisma.matchTopPlayer.deleteMany({ where: { matchId } }),
    prisma.matchTopPlayer.createMany({ data: playerIds.map((playerId, i) => ({ matchId, playerId, rank: i + 1 })) }),
  ]);
  broadcastMatchUpdate(matchId);
  res.json({ playerIds });
}

export async function listMatchEvents(req: Request, res: Response) {
  const events = await prisma.matchEvent.findMany({
    where: { matchId: req.params.id },
    include: { player: true, relatedPlayer: true },
    orderBy: [{ second: "asc" }, { createdAt: "asc" }],
  });
  res.json({ events });
}
