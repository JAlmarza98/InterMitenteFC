import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

async function coachAgent() {
  const { user, password } = await createApprovedUser("coach");
  return loginAs(app, user.email, password);
}

describe("players", () => {
  it("lets a coach create, read and update a player", async () => {
    const agent = await coachAgent();

    const createRes = await agent
      .post("/api/players")
      .send({ firstName: "Leo", lastName: "Messi", jerseyNumber: 10 });
    expect(createRes.status).toBe(201);
    const playerId = createRes.body.player.id;
    expect(createRes.body.player.active).toBe(true);

    const getRes = await agent.get(`/api/players/${playerId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.player.lastName).toBe("Messi");

    const updateRes = await agent.patch(`/api/players/${playerId}`).send({ active: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.player.active).toBe(false);
  });

  it("excludes inactive players from the default list, includes them with includeInactive=true", async () => {
    const agent = await coachAgent();
    const activeRes = await agent.post("/api/players").send({ firstName: "Active", lastName: "Player" });
    const inactiveRes = await agent.post("/api/players").send({ firstName: "Inactive", lastName: "Player" });
    await agent.patch(`/api/players/${inactiveRes.body.player.id}`).send({ active: false });

    const defaultList = await agent.get("/api/players");
    const defaultIds = defaultList.body.players.map((p: { id: string }) => p.id);
    expect(defaultIds).toContain(activeRes.body.player.id);
    expect(defaultIds).not.toContain(inactiveRes.body.player.id);

    const fullList = await agent.get("/api/players?includeInactive=true");
    const fullIds = fullList.body.players.map((p: { id: string }) => p.id);
    expect(fullIds).toContain(activeRes.body.player.id);
    expect(fullIds).toContain(inactiveRes.body.player.id);
  });

  it("blocks a member from creating or updating a player", async () => {
    const { user, password } = await createApprovedUser("member");
    const agent = await loginAs(app, user.email, password);

    const createRes = await agent.post("/api/players").send({ firstName: "No", lastName: "Access" });
    expect(createRes.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/players");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid payload with 400", async () => {
    const agent = await coachAgent();
    const res = await agent.post("/api/players").send({ firstName: "" });
    expect(res.status).toBe(400);
  });

  it("paginates when limit is given, and stays unpaginated otherwise", async () => {
    const agent = await coachAgent();
    for (let i = 0; i < 3; i++) {
      await agent.post("/api/players").send({ firstName: `P${i}`, lastName: "Test" });
    }

    const unpaginated = await agent.get("/api/players");
    expect(unpaginated.body.players).toHaveLength(3);
    expect(unpaginated.body.total).toBeUndefined();

    const page1 = await agent.get("/api/players?limit=2");
    expect(page1.body.players).toHaveLength(2);
    expect(page1.body.total).toBe(3);

    const page2 = await agent.get("/api/players?limit=2&page=2");
    expect(page2.body.players).toHaveLength(1);
  });
});
