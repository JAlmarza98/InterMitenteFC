import { MatchClockPause, MatchPeriod, PeriodType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Nominal minute at which each period begins, following the usual football
 * convention (45' halves). Lets stored minutes read like a normal match
 * clock without needing to track "added time" precisely.
 */
const PERIOD_OFFSET_MINUTES: Record<PeriodType, number> = {
  first_half: 0,
  second_half: 45,
  extra_first: 90,
  extra_second: 105,
};

const PERIOD_ORDER: PeriodType[] = ["first_half", "second_half", "extra_first", "extra_second"];

function elapsedSecondsInPeriod(period: MatchPeriod, pauses: MatchClockPause[], now: Date): number {
  if (!period.startedAt) return 0;
  const end = period.endedAt ?? now;
  let elapsedMs = end.getTime() - period.startedAt.getTime();
  for (const pause of pauses) {
    const pauseEnd = pause.resumedAt ?? now;
    elapsedMs -= pauseEnd.getTime() - pause.pausedAt.getTime();
  }
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

function isPeriodPaused(pauses: MatchClockPause[]): boolean {
  return pauses.some((p) => p.resumedAt === null);
}

async function getActivePeriod(matchId: string) {
  return prisma.matchPeriod.findFirst({
    where: { matchId, startedAt: { not: null }, endedAt: null },
    include: { pauses: true },
  });
}

/** Current match minute (nominal, offset by period), used to stamp segments/substitutions. */
async function computeCurrentMinute(matchId: string, now: Date): Promise<{ period: MatchPeriod; minute: number }> {
  const active = await getActivePeriod(matchId);
  if (!active) {
    throw new HttpError(400, "No hay ningún período en curso");
  }
  const elapsedMinutes = Math.floor(elapsedSecondsInPeriod(active, active.pauses, now) / 60);
  return { period: active, minute: PERIOD_OFFSET_MINUTES[active.type] + elapsedMinutes };
}

export async function getClockState(matchId: string) {
  const now = new Date();
  const periods = await prisma.matchPeriod.findMany({
    where: { matchId },
    include: { pauses: true },
    orderBy: { type: "asc" },
  });

  const active = periods.find((p) => p.startedAt && !p.endedAt) ?? null;

  let currentMinute: number | null = null;
  let isPaused = false;
  if (active) {
    const elapsedMinutes = Math.floor(elapsedSecondsInPeriod(active, active.pauses, now) / 60);
    currentMinute = PERIOD_OFFSET_MINUTES[active.type] + elapsedMinutes;
    isPaused = isPeriodPaused(active.pauses);
  }

  return {
    serverNow: now.toISOString(),
    periods: periods.map((p) => ({
      type: p.type,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      pauses: p.pauses.map((pause) => ({ pausedAt: pause.pausedAt, resumedAt: pause.resumedAt })),
    })),
    activePeriodType: active?.type ?? null,
    isPaused,
    currentMinute,
  };
}

export async function startPeriod(matchId: string, type: PeriodType) {
  const now = new Date();

  const existingActive = await getActivePeriod(matchId);
  if (existingActive) {
    throw new HttpError(400, `El período ${existingActive.type} ya está en curso`);
  }

  const existing = await prisma.matchPeriod.findUnique({ where: { matchId_type: { matchId, type } } });
  if (existing?.startedAt) {
    throw new HttpError(400, `El período ${type} ya se inició anteriormente`);
  }

  const isFirstPeriodOfMatch = type === PERIOD_ORDER[0];

  await prisma.$transaction(async (tx) => {
    await tx.matchPeriod.upsert({
      where: { matchId_type: { matchId, type } },
      create: { matchId, type, startedAt: now },
      update: { startedAt: now },
    });

    await tx.match.update({ where: { id: matchId }, data: { status: "live" } });

    if (isFirstPeriodOfMatch) {
      const starters = await tx.matchSquad.findMany({ where: { matchId, isStarter: true } });
      if (starters.length > 0) {
        await tx.playingTimeSegment.createMany({
          data: starters.map((s) => ({
            matchId,
            playerId: s.playerId,
            periodType: type,
            startMinute: PERIOD_OFFSET_MINUTES[type],
            startedAt: now,
            source: "live",
          })),
        });
      }
    }
  });

  return getClockState(matchId);
}

export async function pauseClock(matchId: string) {
  const active = await getActivePeriod(matchId);
  if (!active) throw new HttpError(400, "No hay ningún período en curso");
  if (isPeriodPaused(active.pauses)) throw new HttpError(400, "El período ya está en pausa");

  await prisma.matchClockPause.create({
    data: { periodId: active.id, pausedAt: new Date() },
  });
  return getClockState(matchId);
}

export async function resumeClock(matchId: string) {
  const active = await getActivePeriod(matchId);
  if (!active) throw new HttpError(400, "No hay ningún período en curso");

  const openPause = active.pauses.find((p) => p.resumedAt === null);
  if (!openPause) throw new HttpError(400, "El período no está en pausa");

  await prisma.matchClockPause.update({
    where: { id: openPause.id },
    data: { resumedAt: new Date() },
  });
  return getClockState(matchId);
}

export async function endPeriod(matchId: string) {
  const active = await getActivePeriod(matchId);
  if (!active) throw new HttpError(400, "No hay ningún período en curso");

  await prisma.matchPeriod.update({ where: { id: active.id }, data: { endedAt: new Date() } });
  return getClockState(matchId);
}

export async function substitute(matchId: string, playerOutId: string, playerInId: string, userId: string) {
  const now = new Date();
  const { period, minute } = await computeCurrentMinute(matchId, now);

  const openOutSegment = await prisma.playingTimeSegment.findFirst({
    where: { matchId, playerId: playerOutId, endMinute: null },
  });
  if (!openOutSegment) {
    throw new HttpError(400, "El jugador que sale no está actualmente en el campo");
  }

  const openInSegment = await prisma.playingTimeSegment.findFirst({
    where: { matchId, playerId: playerInId, endMinute: null },
  });
  if (openInSegment) {
    throw new HttpError(400, "El jugador que entra ya está en el campo");
  }

  await prisma.$transaction([
    prisma.playingTimeSegment.update({
      where: { id: openOutSegment.id },
      data: { endMinute: minute, endedAt: now },
    }),
    prisma.playingTimeSegment.create({
      data: {
        matchId,
        playerId: playerInId,
        periodType: period.type,
        startMinute: minute,
        startedAt: now,
        source: "live",
        createdByUserId: userId,
      },
    }),
  ]);

  return getClockState(matchId);
}

export async function finishMatch(matchId: string) {
  const now = new Date();
  const active = await getActivePeriod(matchId);

  await prisma.$transaction(async (tx) => {
    if (active) {
      await tx.matchPeriod.update({ where: { id: active.id }, data: { endedAt: now } });
    }

    const finalMinute = active
      ? PERIOD_OFFSET_MINUTES[active.type] + Math.floor(elapsedSecondsInPeriod(active, active.pauses, now) / 60)
      : null;

    const openSegments = await tx.playingTimeSegment.findMany({ where: { matchId, endMinute: null } });
    for (const segment of openSegments) {
      await tx.playingTimeSegment.update({
        where: { id: segment.id },
        data: { endMinute: finalMinute ?? segment.startMinute, endedAt: now },
      });
    }

    await tx.match.update({ where: { id: matchId }, data: { status: "finished" } });
  });

  return getClockState(matchId);
}

export interface ManualSegmentInput {
  playerId: string;
  periodType: PeriodType;
  startMinute: number;
  endMinute: number | null;
}

export async function listSegments(matchId: string) {
  return prisma.playingTimeSegment.findMany({
    where: { matchId },
    include: { player: true },
    orderBy: [{ startMinute: "asc" }],
  });
}

export async function createManualSegment(matchId: string, data: ManualSegmentInput, userId: string) {
  if (data.endMinute !== null && data.endMinute < data.startMinute) {
    throw new HttpError(400, "El minuto de salida no puede ser anterior al de entrada");
  }
  return prisma.playingTimeSegment.create({
    data: { matchId, ...data, source: "manual", createdByUserId: userId },
    include: { player: true },
  });
}

export async function updateManualSegment(
  matchId: string,
  segmentId: string,
  data: Partial<ManualSegmentInput>
) {
  if (
    data.startMinute !== undefined &&
    data.endMinute !== undefined &&
    data.endMinute !== null &&
    data.endMinute < data.startMinute
  ) {
    throw new HttpError(400, "El minuto de salida no puede ser anterior al de entrada");
  }
  return prisma.playingTimeSegment.update({
    where: { id: segmentId, matchId },
    data,
    include: { player: true },
  });
}

export async function deleteSegment(matchId: string, segmentId: string) {
  await prisma.playingTimeSegment.delete({ where: { id: segmentId, matchId } });
}
