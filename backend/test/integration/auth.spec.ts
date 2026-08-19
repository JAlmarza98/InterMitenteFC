import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDb } from "../helpers/db";
import { loginAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

describe("auth flow", () => {
  it("registers a pending user, blocks login until approved, then allows it", async () => {
    const email = "newcoach@example.com";
    const password = "supersecret1";

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email, password, name: "New Coach" });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe(email);
    expect(registerRes.body.user.passwordHash).toBeUndefined();

    const blockedLogin = await request(app).post("/api/auth/login").send({ email, password });
    expect(blockedLogin.status).toBe(403);

    const pendingUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.user.update({
      where: { id: pendingUser.id },
      data: { status: "approved", approvedAt: new Date() },
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(email);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meAfterLogout = await agent.get("/api/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });

  it("rejects registering an email that's already taken", async () => {
    const email = "duplicate@example.com";
    const payload = { email, password: "supersecret1", name: "First" };
    const first = await request(app).post("/api/auth/register").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/auth/register").send({ ...payload, name: "Second" });
    expect(second.status).toBe(409);
  });

  it("rejects a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("me returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
