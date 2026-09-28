import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function coachAgent() {
  const { user, password } = await createApprovedUser("coach");
  return loginAs(app, user.email, password);
}

async function adminAgent() {
  const { user, password } = await createApprovedUser("admin");
  return loginAs(app, user.email, password);
}

async function createSevenPlayers() {
  const players = [];
  for (let i = 0; i < 7; i++) {
    players.push(await prisma.player.create({ data: { firstName: `P${i}`, lastName: `Last${i}` } }));
  }
  return players;
}

async function createMatchViaApi(agent: Awaited<ReturnType<typeof loginAs>>) {
  const res = await agent.post("/api/matches").send({
    opponent: "CD Rivas",
    matchDate: "2026-09-01T18:00:00.000Z",
    homeAway: "home",
  });
  return res.body.match.id as string;
}

describe("matches", () => {
  it("lets a coach create, read, update and delete a match", async () => {
    const agent = await coachAgent();

    const createRes = await agent.post("/api/matches").send({
      opponent: "CD Rivas",
      matchDate: "2026-09-01T18:00:00.000Z",
      homeAway: "home",
    });
    expect(createRes.status).toBe(201);
    const matchId = createRes.body.match.id;

    const getRes = await agent.get(`/api/matches/${matchId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.match.opponent).toBe("CD Rivas");

    const updateRes = await agent.patch(`/api/matches/${matchId}`).send({ opponent: "CD Rivas B" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.match.opponent).toBe("CD Rivas B");

    // Score/status are admin-only, even for the coach who owns the match.
    const forbiddenStatusChange = await agent.patch(`/api/matches/${matchId}`).send({ status: "live" });
    expect(forbiddenStatusChange.status).toBe(403);

    // Deleting is admin-only too.
    const forbiddenDelete = await agent.delete(`/api/matches/${matchId}`);
    expect(forbiddenDelete.status).toBe(403);
  });

  it("blocks a member from creating a match", async () => {
    const { user, password } = await createApprovedUser("member");
    const agent = await loginAs(app, user.email, password);

    const res = await agent.post("/api/matches").send({
      opponent: "CD Rivas",
      matchDate: "2026-09-01T18:00:00.000Z",
      homeAway: "home",
    });
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/matches");
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads with a 400", async () => {
    const agent = await coachAgent();
    const res = await agent.post("/api/matches").send({ opponent: "", homeAway: "home" });
    expect(res.status).toBe(400);
  });

  it("404s on a match that doesn't exist", async () => {
    const agent = await coachAgent();
    const res = await agent.get("/api/matches/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("400s when creating a match with a seasonId that doesn't exist", async () => {
    const agent = await coachAgent();
    const res = await agent.post("/api/matches").send({
      opponent: "CD Rivas",
      matchDate: "2026-09-01T18:00:00.000Z",
      homeAway: "home",
      seasonId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
  });

  it("lets an admin delete a match", async () => {
    const admin = await adminAgent();
    const matchId = await createMatchViaApi(admin);

    const deleteRes = await admin.delete(`/api/matches/${matchId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await admin.get(`/api/matches/${matchId}`);
    expect(getRes.status).toBe(404);
  });

  describe("squad, stats and match events", () => {
    it("sets a valid 7-player squad and rejects an invalid-sized one", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      const players = await createSevenPlayers();

      const tooFew = await coach
        .put(`/api/matches/${matchId}/squad`)
        .send({ players: [{ playerId: players[0].id, isStarter: true }] });
      expect(tooFew.status).toBe(400);

      const validRes = await coach.put(`/api/matches/${matchId}/squad`).send({
        players: players.map((p) => ({ playerId: p.id, isStarter: true })),
      });
      expect(validRes.status).toBe(200);
      expect(validRes.body.squad).toHaveLength(7);
    });

    it("409s when the squad payload lists the same player twice", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      const players = await createSevenPlayers();

      const res = await coach.put(`/api/matches/${matchId}/squad`).send({
        players: [
          ...players.slice(0, 6).map((p) => ({ playerId: p.id, isStarter: true })),
          { playerId: players[0].id, isStarter: true }, // duplicate — 7 entries, but only 6 distinct players
        ],
      });
      expect(res.status).toBe(409);
    });

    it("lets an admin (but not a coach) upsert a player's manual stat line", async () => {
      const admin = await adminAgent();
      const matchId = await createMatchViaApi(admin);
      const [player] = await createSevenPlayers();

      const forbidden = await (
        await coachAgent()
      )
        .put(`/api/matches/${matchId}/player-stats/${player.id}`)
        .send({ goals: 1 });
      expect(forbidden.status).toBe(403);

      const createRes = await admin
        .put(`/api/matches/${matchId}/player-stats/${player.id}`)
        .send({ goals: 1 });
      expect(createRes.status).toBe(200);
      expect(createRes.body.stat.goals).toBe(1);

      const updateRes = await admin
        .put(`/api/matches/${matchId}/player-stats/${player.id}`)
        .send({ goals: 2, assists: 1 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.stat.goals).toBe(2);
      expect(updateRes.body.stat.assists).toBe(1);
    });

    it("lets an admin record stats for a player who wasn't called up", async () => {
      const admin = await adminAgent();
      const matchId = await createMatchViaApi(admin);
      const players = await createSevenPlayers();
      await admin.put(`/api/matches/${matchId}/squad`).send({
        players: players.map((p) => ({ playerId: p.id, isStarter: true })),
      });
      const outsider = await prisma.player.create({ data: { firstName: "Not", lastName: "Called" } });

      const before = await admin.get(`/api/matches/${matchId}/stats`);
      expect(before.body.players.map((p: { playerId: string }) => p.playerId)).not.toContain(outsider.id);

      const upsertRes = await admin
        .put(`/api/matches/${matchId}/player-stats/${outsider.id}`)
        .send({ goals: 1, penaltiesWon: 1 });
      expect(upsertRes.status).toBe(200);

      const after = await admin.get(`/api/matches/${matchId}/stats`);
      expect(after.body.players).toHaveLength(8);
      const outsiderRow = after.body.players.find((p: { playerId: string }) => p.playerId === outsider.id);
      expect(outsiderRow).toMatchObject({ inSquad: false, isStarter: false, goals: 1, penaltiesWon: 1 });
      const squadRow = after.body.players.find((p: { playerId: string }) => p.playerId === players[0].id);
      expect(squadRow.inSquad).toBe(true);

      // Playing time alone is also enough to list them.
      const other = await prisma.player.create({ data: { firstName: "Late", lastName: "Arrival" } });
      await admin.post(`/api/matches/${matchId}/segments`).send({
        playerId: other.id,
        periodType: "second_half",
        startSecond: 1800,
        endSecond: 2400,
      });
      const withSegment = await admin.get(`/api/matches/${matchId}/stats`);
      const otherRow = withSegment.body.players.find((p: { playerId: string }) => p.playerId === other.id);
      expect(otherRow).toMatchObject({ inSquad: false, secondsPlayed: 600 });

      // Correcting everything back to zero drops the outsider off the list again.
      await admin
        .put(`/api/matches/${matchId}/player-stats/${outsider.id}`)
        .send({ goals: 0, penaltiesWon: 0 });
      const reset = await admin.get(`/api/matches/${matchId}/stats`);
      expect(reset.body.players.map((p: { playerId: string }) => p.playerId)).not.toContain(outsider.id);
    });

    it("keeps penalty goals within the player's total goals on a manual correction", async () => {
      const admin = await adminAgent();
      const matchId = await createMatchViaApi(admin);
      const [player] = await createSevenPlayers();
      const url = `/api/matches/${matchId}/player-stats/${player.id}`;

      expect((await admin.put(url).send({ penaltyGoals: 1 })).status).toBe(400);
      expect((await admin.put(url).send({ goals: 2, penaltyGoals: 1 })).status).toBe(200);
      // A partial update is checked against what's already stored.
      expect((await admin.put(url).send({ goals: 0 })).status).toBe(400);
      expect((await admin.put(url).send({ penaltyGoals: 2 })).status).toBe(200);

      const stored = await prisma.matchPlayerStat.findUniqueOrThrow({
        where: { matchId_playerId: { matchId, playerId: player.id } },
      });
      expect(stored).toMatchObject({ goals: 2, penaltyGoals: 2 });
    });

    it("404s a manual stat line for a player or match that doesn't exist", async () => {
      const admin = await adminAgent();
      const matchId = await createMatchViaApi(admin);
      const [player] = await createSevenPlayers();
      const missing = "00000000-0000-0000-0000-000000000000";

      expect(
        (await admin.put(`/api/matches/${matchId}/player-stats/${missing}`).send({ goals: 1 })).status
      ).toBe(404);
      expect(
        (await admin.put(`/api/matches/${missing}/player-stats/${player.id}`).send({ goals: 1 })).status
      ).toBe(404);
    });

    it("logs goal/own_goal/opponent_goal/red_card events, updating score, stats and playing time", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      const players = await createSevenPlayers();
      await coach.put(`/api/matches/${matchId}/squad`).send({
        players: players.map((p) => ({ playerId: p.id, isStarter: true })),
      });
      await coach.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });

      const scorer = players[0];
      const goalRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: scorer.id, type: "goal" });
      expect(goalRes.status).toBe(201);
      expect(goalRes.body.match.teamScore).toBe(1);
      expect(goalRes.body.stat.goals).toBe(1);

      const ownGoalRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: players[1].id, type: "own_goal" });
      expect(ownGoalRes.body.match.opponentScore).toBe(1);

      const opponentGoalRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ type: "opponent_goal" });
      expect(opponentGoalRes.status).toBe(201);
      expect(opponentGoalRes.body.match.opponentScore).toBe(2);

      const redCardTarget = players[2];
      const redCardRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: redCardTarget.id, type: "red_card" });
      expect(redCardRes.status).toBe(201);

      const segments = await prisma.playingTimeSegment.findMany({
        where: { matchId, playerId: redCardTarget.id },
      });
      expect(segments[0].endSecond).not.toBeNull();

      const eventsRes = await coach.get(`/api/matches/${matchId}/events`);
      expect(eventsRes.status).toBe(200);
      // The four logged above, plus the first half's kick-off.
      expect(eventsRes.body.events).toHaveLength(5);

      // The scorer's playing-time segment is still open (live match) — let
      // just over a second of real time pass so secondsPlayed, and with it
      // the rating, is non-zero (computeMatchRating(0 seconds) is null).
      await sleep(1100);

      const statsRes = await coach.get(`/api/matches/${matchId}/stats`);
      expect(statsRes.status).toBe(200);
      const scorerRow = statsRes.body.players.find((p: { playerId: string }) => p.playerId === scorer.id);
      expect(scorerRow.goals).toBe(1);
      expect(scorerRow.secondsPlayed).toBeGreaterThan(0);
      expect(scorerRow.rating).not.toBeNull();
    });

    it("logs penalty_goal as a goal too, and penalty_won as its own counter", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      const players = await createSevenPlayers();
      await coach.put(`/api/matches/${matchId}/squad`).send({
        players: players.map((p) => ({ playerId: p.id, isStarter: true })),
      });
      await coach.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });

      const [taker, fouled] = players;
      const penaltyWonRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: fouled.id, type: "penalty_won" });
      expect(penaltyWonRes.status).toBe(201);
      expect(penaltyWonRes.body.stat.penaltiesWon).toBe(1);
      expect(penaltyWonRes.body.match).toBeNull();

      const penaltyGoalRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: taker.id, type: "penalty_goal" });
      expect(penaltyGoalRes.status).toBe(201);
      expect(penaltyGoalRes.body.match.teamScore).toBe(1);
      expect(penaltyGoalRes.body.stat.goals).toBe(1);
      expect(penaltyGoalRes.body.stat.penaltyGoals).toBe(1);

      const statsRes = await coach.get(`/api/matches/${matchId}/stats`);
      const takerRow = statsRes.body.players.find((p: { playerId: string }) => p.playerId === taker.id);
      const fouledRow = statsRes.body.players.find((p: { playerId: string }) => p.playerId === fouled.id);
      expect(takerRow).toMatchObject({ goals: 1, penaltyGoals: 1, penaltiesWon: 0 });
      expect(fouledRow).toMatchObject({ goals: 0, penaltyGoals: 0, penaltiesWon: 1 });

      const eventsRes = await coach.get(`/api/matches/${matchId}/events`);
      expect(eventsRes.body.events.map((e: { type: string }) => e.type)).toEqual([
        "period_start",
        "penalty_won",
        "penalty_goal",
      ]);
    });

    it("lets a bench player be booked, and keeps a sent-off substitute from coming on", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      const starters = await createSevenPlayers();
      const sub = await prisma.player.create({ data: { firstName: "Sub", lastName: "One" } });
      await coach.put(`/api/matches/${matchId}/squad`).send({
        players: [
          ...starters.map((p) => ({ playerId: p.id, isStarter: true })),
          { playerId: sub.id, isStarter: false },
        ],
      });
      await coach.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });

      const yellowRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: sub.id, type: "yellow_card" });
      expect(yellowRes.status).toBe(201);
      expect(yellowRes.body.stat.yellowCards).toBe(1);

      // Booked without playing still earns a (harsh) rating, on the same
      // 10-minute minimum scale as a cameo.
      const statsRes = await coach.get(`/api/matches/${matchId}/stats`);
      const subRow = statsRes.body.players.find((p: { playerId: string }) => p.playerId === sub.id);
      expect(subRow).toMatchObject({ secondsPlayed: 0, yellowCards: 1, rating: 1.4 });

      const redRes = await coach
        .post(`/api/matches/${matchId}/events`)
        .send({ playerId: sub.id, type: "red_card" });
      expect(redRes.status).toBe(201);
      expect(redRes.body.stat.redCards).toBe(1);

      // Never on the pitch, so there's no playing time to close...
      expect(await prisma.playingTimeSegment.count({ where: { matchId, playerId: sub.id } })).toBe(0);
      // ...and a sent-off substitute can't be brought on afterwards.
      const subRes = await coach
        .post(`/api/matches/${matchId}/substitutions`)
        .send({ playerOutId: starters[0].id, playerInId: sub.id });
      expect(subRes.status).toBe(400);
    });

    it("rejects a match event without a playerId (except opponent_goal)", async () => {
      const coach = await coachAgent();
      const matchId = await createMatchViaApi(coach);
      await coach.post(`/api/matches/${matchId}/clock/start-period`).send({ type: "first_half" });

      const res = await coach.post(`/api/matches/${matchId}/events`).send({ type: "goal" });
      expect(res.status).toBe(400);
    });
  });
});
