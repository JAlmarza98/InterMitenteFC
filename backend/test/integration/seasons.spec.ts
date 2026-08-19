import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

async function adminAgent() {
  const { user, password } = await createApprovedUser("admin");
  return loginAs(app, user.email, password);
}

describe("seasons", () => {
  it("lets an admin create and update a season", async () => {
    const agent = await adminAgent();

    const createRes = await agent.post("/api/seasons").send({
      name: "2026/2027",
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2027-06-30T00:00:00.000Z",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.season.isActive).toBe(false);
    const seasonId = createRes.body.season.id;

    const updateRes = await agent.patch(`/api/seasons/${seasonId}`).send({ isActive: true });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.season.isActive).toBe(true);
  });

  it("lists seasons for any approved user", async () => {
    const admin = await adminAgent();
    await admin.post("/api/seasons").send({
      name: "2026/2027",
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2027-06-30T00:00:00.000Z",
    });

    const { user, password } = await createApprovedUser("member");
    const memberAgent = await loginAs(app, user.email, password);
    const listRes = await memberAgent.get("/api/seasons");
    expect(listRes.status).toBe(200);
    expect(listRes.body.seasons).toHaveLength(1);
  });

  it("blocks a coach from creating a season (admin-only)", async () => {
    const { user, password } = await createApprovedUser("coach");
    const agent = await loginAs(app, user.email, password);

    const res = await agent.post("/api/seasons").send({
      name: "2026/2027",
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2027-06-30T00:00:00.000Z",
    });
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/seasons");
    expect(res.status).toBe(401);
  });
});
