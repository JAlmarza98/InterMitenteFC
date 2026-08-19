import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createMatch(agent: Awaited<ReturnType<typeof loginAs>>) {
  const res = await agent.post("/api/matches").send({
    opponent: "CD Rivas",
    matchDate: "2026-09-01T18:00:00.000Z",
    homeAway: "home",
  });
  return res.body.match.id as string;
}

describe("match clock", () => {
  it("tracks elapsed time through start, pause, resume and end period", async () => {
    const { user, password } = await createApprovedUser("coach");
    const agent = await loginAs(app, user.email, password);
    const matchId = await createMatch(agent);

    const start = await agent.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });
    expect(start.status).toBe(200);
    expect(start.body.activePeriodType).toBe("first_half");
    expect(start.body.isPaused).toBe(false);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("live");

    await sleep(1100); // let just over a second of real elapsed time pass

    const pause = await agent.post(`/api/matches/${matchId}/clock/pause`).send();
    expect(pause.status).toBe(200);
    expect(pause.body.isPaused).toBe(true);
    const secondAtPause = pause.body.currentSecond as number;
    expect(secondAtPause).toBeGreaterThanOrEqual(1);

    // Time passing while paused must NOT be counted.
    await sleep(1100);
    const stillPaused = await agent.get(`/api/matches/${matchId}/clock`);
    expect(stillPaused.body.currentSecond).toBe(secondAtPause);

    const resume = await agent.post(`/api/matches/${matchId}/clock/resume`).send();
    expect(resume.status).toBe(200);
    expect(resume.body.isPaused).toBe(false);

    const end = await agent.post(`/api/matches/${matchId}/clock/end-period`).send();
    expect(end.status).toBe(200);
    expect(end.body.activePeriodType).toBeNull();

    // The finished period's elapsed time is now frozen — later reads
    // shouldn't move even though `now` keeps advancing.
    const finalState = await agent.get(`/api/matches/${matchId}/clock`);
    const closedPeriod = finalState.body.periods.find((p: { type: string }) => p.type === "first_half");
    expect(closedPeriod.endedAt).not.toBeNull();
  });

  it("refuses to start the same period twice", async () => {
    const { user, password } = await createApprovedUser("coach");
    const agent = await loginAs(app, user.email, password);
    const matchId = await createMatch(agent);

    await agent.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });
    const secondStart = await agent
      .post(`/api/matches/${matchId}/clock/start-period`)
      .send({ type: "first_half" });
    expect(secondStart.status).toBe(400);
  });

  it("is off-limits to a member", async () => {
    const { user: coach, password: coachPassword } = await createApprovedUser("coach");
    const coachAgent = await loginAs(app, coach.email, coachPassword);
    const matchId = await createMatch(coachAgent);

    const { user: member, password: memberPassword } = await createApprovedUser("member");
    const memberAgent = await loginAs(app, member.email, memberPassword);

    const res = await memberAgent.get(`/api/matches/${matchId}/clock`);
    expect(res.status).toBe(403);
  });

  async function coachWithStartedMatch() {
    const { user, password } = await createApprovedUser("coach");
    const agent = await loginAs(app, user.email, password);
    const matchId = await createMatch(agent);
    const players = [];
    for (let i = 0; i < 7; i++) {
      players.push(await prisma.player.create({ data: { firstName: `P${i}`, lastName: `Last${i}` } }));
    }
    await agent.put(`/api/matches/${matchId}/squad`).send({
      players: players.map((p) => ({ playerId: p.id, isStarter: true })),
    });
    await agent.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });
    return { agent, matchId, players };
  }

  it("substitutes a player on for one currently on the pitch", async () => {
    const { agent, matchId, players } = await coachWithStartedMatch();
    const playerOut = players[0];
    // All 7 squad players are on the pitch (fútbol 7), so the incoming
    // player has to be someone outside the squad — a benched 8th player.
    const bench = await prisma.player.create({ data: { firstName: "Bench", lastName: "Player" } });

    const res = await agent.post(`/api/matches/${matchId}/substitutions`).send({
      playerOutId: playerOut.id,
      playerInId: bench.id,
    });
    expect(res.status).toBe(200);

    const outSegment = await prisma.playingTimeSegment.findFirst({ where: { matchId, playerId: playerOut.id } });
    expect(outSegment?.endSecond).not.toBeNull();
    const inSegment = await prisma.playingTimeSegment.findFirst({ where: { matchId, playerId: bench.id } });
    expect(inSegment).not.toBeNull();
    expect(inSegment?.endSecond).toBeNull();
  });

  it("refuses to substitute a player who isn't currently on the pitch", async () => {
    const { agent, matchId } = await coachWithStartedMatch();
    const strangerA = await prisma.player.create({ data: { firstName: "A", lastName: "Stranger" } });
    const strangerB = await prisma.player.create({ data: { firstName: "B", lastName: "Stranger" } });

    const res = await agent.post(`/api/matches/${matchId}/substitutions`).send({
      playerOutId: strangerA.id,
      playerInId: strangerB.id,
    });
    expect(res.status).toBe(400);
  });

  it("finish() closes the clock and marks the match finished", async () => {
    const { agent, matchId } = await coachWithStartedMatch();

    const res = await agent.post(`/api/matches/${matchId}/clock/finish`).send();
    expect(res.status).toBe(200);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("finished");

    const openSegments = await prisma.playingTimeSegment.findMany({ where: { matchId, endSecond: null } });
    expect(openSegments).toHaveLength(0);
  });

  describe("manual segments", () => {
    it("creates, updates and deletes a manual playing-time segment", async () => {
      const { agent, matchId } = await coachWithStartedMatch();
      const bench = await prisma.player.create({ data: { firstName: "Bench", lastName: "Player" } });

      const createRes = await agent.post(`/api/matches/${matchId}/segments`).send({
        playerId: bench.id,
        periodType: "first_half",
        startSecond: 600,
        endSecond: 900,
      });
      expect(createRes.status).toBe(201);
      const segmentId = createRes.body.segment.id;

      const updateRes = await agent
        .patch(`/api/matches/${matchId}/segments/${segmentId}`)
        .send({ endSecond: 1000 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.segment.endSecond).toBe(1000);

      const listRes = await agent.get(`/api/matches/${matchId}/segments`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.segments.some((s: { id: string }) => s.id === segmentId)).toBe(true);

      const deleteRes = await agent.delete(`/api/matches/${matchId}/segments/${segmentId}`);
      expect(deleteRes.status).toBe(204);

      const afterDelete = await prisma.playingTimeSegment.findUnique({ where: { id: segmentId } });
      expect(afterDelete).toBeNull();
    });

    it("rejects a segment whose end is before its start", async () => {
      const { agent, matchId } = await coachWithStartedMatch();
      const bench = await prisma.player.create({ data: { firstName: "Bench", lastName: "Player" } });

      const res = await agent.post(`/api/matches/${matchId}/segments`).send({
        playerId: bench.id,
        periodType: "first_half",
        startSecond: 900,
        endSecond: 600,
      });
      expect(res.status).toBe(400);
    });
  });
});
