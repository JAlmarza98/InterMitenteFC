import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";
import { computeMatchRating } from "../../src/modules/stats/playerRating";

beforeEach(async () => {
  await resetDb();
});

describe("season stats", () => {
  it("returns 404 for a season that doesn't exist", async () => {
    const { user, password } = await createApprovedUser("member");
    const agent = await loginAs(app, user.email, password);

    const res = await agent.get("/api/stats/season/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("aggregates playing time, goals and rating for a finished match", async () => {
    const { user: admin, password } = await createApprovedUser("admin");
    const agent = await loginAs(app, admin.email, password);

    const season = await prisma.season.create({
      data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const player = await prisma.player.create({ data: { firstName: "Leo", lastName: "Messi" } });
    const match = await prisma.match.create({
      data: {
        seasonId: season.id,
        opponent: "CD Rivas",
        matchDate: new Date("2026-09-05"),
        homeAway: "home",
        status: "finished",
      },
    });

    // Fixture data for a single played match: 40 minutes on the pitch, one goal.
    await prisma.playingTimeSegment.create({
      data: {
        matchId: match.id,
        playerId: player.id,
        periodType: "first_half",
        startSecond: 0,
        endSecond: 2400,
        source: "manual",
      },
    });
    await prisma.matchPlayerStat.create({
      data: { matchId: match.id, playerId: player.id, goals: 1 },
    });

    const res = await agent.get(`/api/stats/season/${season.id}`);
    expect(res.status).toBe(200);
    expect(res.body.matchesPlayed).toBe(1);

    const row = res.body.players.find((p: { playerId: string }) => p.playerId === player.id);
    expect(row).toBeDefined();
    expect(row.appearances).toBe(1);
    expect(row.secondsPlayed).toBe(2400);
    expect(row.goals).toBe(1);
    expect(row.avgRating).toBe(
      computeMatchRating({ goals: 1, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0, secondsPlayed: 2400 })
    );
  });

  it("excludes matches that haven't finished yet", async () => {
    const { user: admin, password } = await createApprovedUser("admin");
    const agent = await loginAs(app, admin.email, password);

    const season = await prisma.season.create({
      data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    await prisma.match.create({
      data: { seasonId: season.id, opponent: "CD Rivas", matchDate: new Date(), homeAway: "home", status: "scheduled" },
    });

    const res = await agent.get(`/api/stats/season/${season.id}`);
    expect(res.status).toBe(200);
    expect(res.body.matchesPlayed).toBe(0);
  });

  it("rejects an unauthenticated request", async () => {
    const season = await prisma.season.create({
      data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });
    const res = await request(app).get(`/api/stats/season/${season.id}`);
    expect(res.status).toBe(401);
  });
});
