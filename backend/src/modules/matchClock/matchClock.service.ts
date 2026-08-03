import { MatchClockPause, MatchPeriod, PeriodType, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

type Db = typeof prisma | Prisma.TransactionClient;

/** Runs `fn` in a transaction isolated enough that Postgres aborts one side
 * of a check-then-act race (e.g. two "start period" requests) instead of
 * silently letting both through. Conflicts surface as P2034, mapped to a
 * 409 by the error handler. */
function runIsolated<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const PERIOD_ORDER: PeriodType[] = ["first_half", "second_half", "extra_first", "extra_second"];

/** Fútbol 7: never more than 7 players on the pitch at once. */
const MAX_ON_PITCH = 7;

type PeriodWithPauses = MatchPeriod & { pauses: MatchClockPause[] };

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

/**
 * Cumulative elapsed seconds at which `type` begins: the sum of the
 * ACTUAL recorded duration of every period that precedes it in
 * PERIOD_ORDER — not the configured period length. A half that runs long
 * (injury time) or is ended early shifts every later period's start
 * accordingly. Basing this on `periodLengthMinutes` instead — as this used
 * to — either discarded real playing time (a half cut short still handed
 * the next period the full nominal offset) or fabricated it (crediting a
 * player for nominal minutes they never actually played) for anyone still
 * on the pitch across the boundary.
 */
function offsetSecondsFor(type: PeriodType, periodsByType: Map<PeriodType, PeriodWithPauses>, now: Date): number {
  let offset = 0;
  for (const priorType of PERIOD_ORDER) {
    if (priorType === type) break;
    const prior = periodsByType.get(priorType);
    if (prior?.startedAt) {
      offset += elapsedSecondsInPeriod(prior, prior.pauses, now);
    }
  }
  return offset;
}

/** The period currently running (started, not yet ended), if any. */
function getActiveFrom(periodsByType: Map<PeriodType, PeriodWithPauses>): PeriodWithPauses | null {
  for (const type of PERIOD_ORDER) {
    const p = periodsByType.get(type);
    if (p?.startedAt && !p.endedAt) return p;
  }
  return null;
}

/**
 * The furthest-along period that has been started, whether it's still
 * running or already ended (e.g. at half-time, between periods). Used to
 * compute a frozen "as of now" elapsed time even when the clock isn't
 * actively ticking, so a player left open across a break doesn't lose the
 * time they already accrued.
 */
function getMostAdvancedFrom(periodsByType: Map<PeriodType, PeriodWithPauses>): PeriodWithPauses | null {
  for (let i = PERIOD_ORDER.length - 1; i >= 0; i--) {
    const p = periodsByType.get(PERIOD_ORDER[i]);
    if (p?.startedAt) return p;
  }
  return null;
}

async function getPeriodsByType(matchId: string, db: Db = prisma): Promise<Map<PeriodType, PeriodWithPauses>> {
  const periods = await db.matchPeriod.findMany({ where: { matchId }, include: { pauses: true } });
  return new Map(periods.map((p) => [p.type, p]));
}

async function getMatchPeriodLength(matchId: string, db: Db = prisma): Promise<number> {
  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { periodLengthMinutes: true },
  });
  return match.periodLengthMinutes;
}

/**
 * Stamp (period + elapsed second) to attach to a match event logged live.
 * Uses the most advanced period rather than requiring one to be actively
 * running, so an action logged right at/after half-time (or once the last
 * period has ended) still gets a sensible timestamp instead of failing.
 */
export async function getEventStamp(matchId: string): Promise<{ periodType: PeriodType; second: number }> {
  const now = new Date();
  const periodsByType = await getPeriodsByType(matchId);
  const period = getMostAdvancedFrom(periodsByType);
  if (!period) {
    throw new HttpError(400, "El partido todavía no ha empezado");
  }
  const elapsed = elapsedSecondsInPeriod(period, period.pauses, now);
  return { periodType: period.type, second: offsetSecondsFor(period.type, periodsByType, now) + elapsed };
}

export async function getClockState(matchId: string) {
  const now = new Date();
  const [periodsByType, periodLengthMinutes] = await Promise.all([
    getPeriodsByType(matchId),
    getMatchPeriodLength(matchId),
  ]);

  const active = getActiveFrom(periodsByType);

  let currentSecond: number | null = null;
  let isPaused = false;
  if (active) {
    const elapsed = elapsedSecondsInPeriod(active, active.pauses, now);
    currentSecond = offsetSecondsFor(active.type, periodsByType, now) + elapsed;
    isPaused = isPeriodPaused(active.pauses);
  }

  const orderedPeriods = PERIOD_ORDER.map((type) => periodsByType.get(type)).filter(
    (p): p is PeriodWithPauses => !!p
  );

  return {
    serverNow: now.toISOString(),
    periodLengthMinutes,
    periods: orderedPeriods.map((p) => ({
      type: p.type,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      pauses: p.pauses.map((pause) => ({ pausedAt: pause.pausedAt, resumedAt: pause.resumedAt })),
    })),
    activePeriodType: active?.type ?? null,
    isPaused,
    currentSecond,
  };
}

export async function startPeriod(matchId: string, type: PeriodType) {
  const isFirstPeriodOfMatch = type === PERIOD_ORDER[0];

  await runIsolated(async (tx) => {
    const now = new Date();
    const periodsByType = await getPeriodsByType(matchId, tx);

    const existingActive = getActiveFrom(periodsByType);
    if (existingActive) {
      throw new HttpError(400, `El período ${existingActive.type} ya está en curso`);
    }

    const existing = periodsByType.get(type);
    if (existing?.startedAt) {
      throw new HttpError(400, `El período ${type} ya se inició anteriormente`);
    }

    const offset = offsetSecondsFor(type, periodsByType, now);

    await tx.matchPeriod.upsert({
      where: { matchId_type: { matchId, type } },
      create: { matchId, type, startedAt: now },
      update: { startedAt: now },
    });

    await tx.match.update({ where: { id: matchId }, data: { status: "live" } });

    if (isFirstPeriodOfMatch) {
      const starters = await tx.matchSquad.findMany({ where: { matchId, isStarter: true } });
      if (starters.length > MAX_ON_PITCH) {
        throw new HttpError(400, `No puede haber más de ${MAX_ON_PITCH} jugadores en el campo (fútbol 7)`);
      }
      if (starters.length > 0) {
        await tx.playingTimeSegment.createMany({
          data: starters.map((s) => ({
            matchId,
            playerId: s.playerId,
            periodType: type,
            startSecond: offset,
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
  await runIsolated(async (tx) => {
    const periodsByType = await getPeriodsByType(matchId, tx);
    const active = getActiveFrom(periodsByType);
    if (!active) throw new HttpError(400, "No hay ningún período en curso");
    if (isPeriodPaused(active.pauses)) throw new HttpError(400, "El período ya está en pausa");

    await tx.matchClockPause.create({
      data: { periodId: active.id, pausedAt: new Date() },
    });
  });
  return getClockState(matchId);
}

export async function resumeClock(matchId: string) {
  await runIsolated(async (tx) => {
    const periodsByType = await getPeriodsByType(matchId, tx);
    const active = getActiveFrom(periodsByType);
    if (!active) throw new HttpError(400, "No hay ningún período en curso");

    const openPause = active.pauses.find((p) => p.resumedAt === null);
    if (!openPause) throw new HttpError(400, "El período no está en pausa");

    await tx.matchClockPause.update({
      where: { id: openPause.id },
      data: { resumedAt: new Date() },
    });
  });
  return getClockState(matchId);
}

export async function endPeriod(matchId: string) {
  await runIsolated(async (tx) => {
    const periodsByType = await getPeriodsByType(matchId, tx);
    const active = getActiveFrom(periodsByType);
    if (!active) throw new HttpError(400, "No hay ningún período en curso");

    const now = new Date();
    // Close any dangling open pause first: elapsedSecondsInPeriod treats an
    // unresumed pause as still running (subtracting up to "now" on every
    // future read), so leaving one open past endedAt would make the frozen
    // elapsed time for this period keep shrinking during e.g. half-time.
    const openPause = active.pauses.find((p) => p.resumedAt === null);
    if (openPause) {
      await tx.matchClockPause.update({ where: { id: openPause.id }, data: { resumedAt: now } });
    }

    await tx.matchPeriod.update({ where: { id: active.id }, data: { endedAt: now } });
  });
  return getClockState(matchId);
}

export async function substitute(matchId: string, playerOutId: string, playerInId: string, userId: string) {
  await runIsolated(async (tx) => {
    const now = new Date();
    const periodsByType = await getPeriodsByType(matchId, tx);
    const active = getActiveFrom(periodsByType);
    if (!active) {
      throw new HttpError(400, "No hay ningún período en curso");
    }
    const redCardedIn = await tx.matchEvent.findFirst({
      where: { matchId, playerId: playerInId, type: "red_card" },
      select: { id: true },
    });
    if (redCardedIn) {
      throw new HttpError(400, "El jugador ha sido expulsado y no puede volver a entrar");
    }

    const elapsed = elapsedSecondsInPeriod(active, active.pauses, now);
    const second = offsetSecondsFor(active.type, periodsByType, now) + elapsed;

    const openOutSegment = await tx.playingTimeSegment.findFirst({
      where: { matchId, playerId: playerOutId, endSecond: null },
    });
    if (!openOutSegment) {
      throw new HttpError(400, "El jugador que sale no está actualmente en el campo");
    }

    const openInSegment = await tx.playingTimeSegment.findFirst({
      where: { matchId, playerId: playerInId, endSecond: null },
    });
    if (openInSegment) {
      throw new HttpError(400, "El jugador que entra ya está en el campo");
    }

    await tx.playingTimeSegment.update({
      where: { id: openOutSegment.id },
      data: { endSecond: second, endedAt: now },
    });
    await tx.playingTimeSegment.create({
      data: {
        matchId,
        playerId: playerInId,
        periodType: active.type,
        startSecond: second,
        startedAt: now,
        source: "live",
        createdByUserId: userId,
      },
    });
    await tx.matchEvent.create({
      data: {
        matchId,
        playerId: playerInId,
        relatedPlayerId: playerOutId,
        type: "substitution",
        periodType: active.type,
        second,
        createdByUserId: userId,
      },
    });
  });

  return getClockState(matchId);
}

/**
 * Ends whatever period is still open (auto-closing a dangling pause first)
 * and closes every open playing-time segment at the resulting elapsed
 * second. Shared by `finishMatch` and by `updateMatch`'s manual
 * status->"finished" transition, so both paths leave the clock in a
 * consistent, fully-closed state instead of the manual path silently
 * leaving periods/segments open forever.
 */
export async function closeOpenClockState(tx: Prisma.TransactionClient, matchId: string, now: Date) {
  const periodsByType = await getPeriodsByType(matchId, tx);
  const active = getActiveFrom(periodsByType);

  if (active) {
    const openPause = active.pauses.find((p) => p.resumedAt === null);
    if (openPause) {
      await tx.matchClockPause.update({ where: { id: openPause.id }, data: { resumedAt: now } });
    }
    await tx.matchPeriod.update({ where: { id: active.id }, data: { endedAt: now } });
  }

  // Re-read the furthest-along period rather than relying on "active": if
  // the coach already ended the last period (a normal step before
  // finishing the match), there's no period left without an endedAt, so
  // computing the final second from "active" alone gave null — collapsing
  // every still-open segment (i.e. every player never substituted out) to
  // endSecond = startSecond, 0 seconds played, even though they played the
  // whole match. `active` (if any) is one of `periodsByType`'s own entries,
  // so its in-memory `endedAt: null` still resolves to `now` in
  // elapsedSecondsInPeriod below — same numeric result as if re-fetched.
  const mostAdvanced = getMostAdvancedFrom(periodsByType);
  const finalSecond = mostAdvanced
    ? offsetSecondsFor(mostAdvanced.type, periodsByType, now) +
      elapsedSecondsInPeriod(mostAdvanced, mostAdvanced.pauses, now)
    : null;

  const openSegments = await tx.playingTimeSegment.findMany({ where: { matchId, endSecond: null } });
  for (const segment of openSegments) {
    await tx.playingTimeSegment.update({
      where: { id: segment.id },
      data: { endSecond: finalSecond ?? segment.startSecond, endedAt: now },
    });
  }
}

export async function finishMatch(matchId: string) {
  await prisma.$transaction(async (tx) => {
    await closeOpenClockState(tx, matchId, new Date());
    await tx.match.update({ where: { id: matchId }, data: { status: "finished" } });
  });

  return getClockState(matchId);
}

export interface ManualSegmentInput {
  playerId: string;
  periodType: PeriodType;
  startSecond: number;
  endSecond: number | null;
}

export async function listSegments(matchId: string) {
  return prisma.playingTimeSegment.findMany({
    where: { matchId },
    include: { player: true },
    orderBy: [{ startSecond: "asc" }],
  });
}

export async function createManualSegment(matchId: string, data: ManualSegmentInput, userId: string) {
  if (data.endSecond !== null && data.endSecond < data.startSecond) {
    throw new HttpError(400, "El momento de salida no puede ser anterior al de entrada");
  }
  if (data.endSecond === null) {
    const onPitchCount = await prisma.playingTimeSegment.count({ where: { matchId, endSecond: null } });
    if (onPitchCount >= MAX_ON_PITCH) {
      throw new HttpError(400, `No puede haber más de ${MAX_ON_PITCH} jugadores en el campo a la vez (fútbol 7)`);
    }
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
    data.startSecond !== undefined &&
    data.endSecond !== undefined &&
    data.endSecond !== null &&
    data.endSecond < data.startSecond
  ) {
    throw new HttpError(400, "El momento de salida no puede ser anterior al de entrada");
  }
  if (data.endSecond === null) {
    const onPitchCount = await prisma.playingTimeSegment.count({
      where: { matchId, endSecond: null, id: { not: segmentId } },
    });
    if (onPitchCount >= MAX_ON_PITCH) {
      throw new HttpError(400, `No puede haber más de ${MAX_ON_PITCH} jugadores en el campo a la vez (fútbol 7)`);
    }
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

/**
 * Elapsed match seconds as of right now (or as of the last period that
 * ended, e.g. at half-time), for a match that has kicked off at least once.
 * Returns null if no period has been started yet. Meant to be computed
 * once and reused across every open segment of a match, rather than
 * re-querying per segment.
 */
export async function computeLiveElapsedSeconds(matchId: string): Promise<number | null> {
  const now = new Date();
  const periodsByType = await getPeriodsByType(matchId);
  const period = getMostAdvancedFrom(periodsByType);
  if (!period) return null;
  const elapsed = elapsedSecondsInPeriod(period, period.pauses, now);
  return offsetSecondsFor(period.type, periodsByType, now) + elapsed;
}

/**
 * Duration in seconds a segment represents. For an open segment, uses
 * `liveCurrentSecond` (from `computeLiveElapsedSeconds`) instead of 0 — a
 * player currently on the pitch, or left on across a break, should show
 * running minutes, not nothing.
 */
export function segmentDurationSeconds(
  segment: { startSecond: number; endSecond: number | null },
  liveCurrentSecond: number | null
): number {
  if (segment.endSecond !== null) {
    return segment.endSecond - segment.startSecond;
  }
  if (liveCurrentSecond === null) {
    return 0;
  }
  return Math.max(0, liveCurrentSecond - segment.startSecond);
}
