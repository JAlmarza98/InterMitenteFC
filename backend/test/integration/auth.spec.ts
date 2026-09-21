import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { resetDb } from "../helpers/db";
import { createApprovedUser, loginAs } from "../helpers/auth";

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
    // The session cookie is named "im.sid" (see middleware/session.ts), not
    // the express-session default "connect.sid" — logout must clear that
    // exact name or the stale cookie lingers in the browser.
    const clearedCookie = logoutRes.headers["set-cookie"]?.[0];
    expect(clearedCookie).toContain("im.sid=;");

    const meAfterLogout = await agent.get("/api/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });

  it("rejects registering an email that's already taken", async () => {
    const email = "duplicate@example.com";
    const payload = { email, password: "supersecret1", name: "First" };
    const first = await request(app).post("/api/auth/register").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/auth/register")
      .send({ ...payload, name: "Second" });
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

describe("password recovery (admin-mediated)", () => {
  it("flags the request, lets an admin mint a one-use link, and resets the password", async () => {
    const { user } = await createApprovedUser();
    const { user: admin, password: adminPassword } = await createApprovedUser("admin");
    const adminAgent = await loginAs(app, admin.email, adminPassword);

    const requestRes = await request(app)
      .post("/api/auth/password-reset-request")
      .send({ email: user.email });
    expect(requestRes.status).toBe(200);

    const listed = await adminAgent.get("/api/admin/users").query({ status: "approved" });
    const listedUser = listed.body.users.find((u: { id: string }) => u.id === user.id);
    expect(listedUser.passwordResetRequested).toBe(true);

    const linkRes = await adminAgent.post(`/api/admin/users/${user.id}/reset-link`);
    expect(linkRes.status).toBe(200);
    const token = linkRes.body.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // Only the hash is stored — a DB leak must not hand out working links.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordResetTokenHash).not.toBe(token);
    expect(stored.passwordResetRequestedAt).toBeNull();

    const newPassword = "brandnewpass1";
    const resetRes = await request(app)
      .post("/api/auth/password-reset")
      .send({ token, password: newPassword });
    expect(resetRes.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: newPassword });
    expect(login.status).toBe(200);

    // One use only: the same token must not work a second time.
    const replay = await request(app)
      .post("/api/auth/password-reset")
      .send({ token, password: "yetanotherpass1" });
    expect(replay.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { user } = await createApprovedUser();
    const { user: admin, password: adminPassword } = await createApprovedUser("admin");
    const adminAgent = await loginAs(app, admin.email, adminPassword);

    const { body } = await adminAgent.post(`/api/admin/users/${user.id}/reset-link`);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/password-reset")
      .send({ token: body.token, password: "expiredlink123" });
    expect(res.status).toBe(400);
  });

  it("answers the same for an unknown email (no account enumeration)", async () => {
    const { user } = await createApprovedUser();
    const known = await request(app).post("/api/auth/password-reset-request").send({ email: user.email });
    const unknown = await request(app)
      .post("/api/auth/password-reset-request")
      .send({ email: "ghost@example.com" });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it("only admins can mint a reset link", async () => {
    const { user } = await createApprovedUser();
    const { user: member, password } = await createApprovedUser("member");
    const memberAgent = await loginAs(app, member.email, password);

    const res = await memberAgent.post(`/api/admin/users/${user.id}/reset-link`);
    expect(res.status).toBe(403);
  });
});

describe("changing your own password", () => {
  it("requires the current password and works with it", async () => {
    const { user, password } = await createApprovedUser();
    const agent = await loginAs(app, user.email, password);

    const wrong = await agent
      .post("/api/auth/password")
      .send({ currentPassword: "notmypassword", newPassword: "replacement123" });
    expect(wrong.status).toBe(400);

    const ok = await agent
      .post("/api/auth/password")
      .send({ currentPassword: password, newPassword: "replacement123" });
    expect(ok.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "replacement123" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects an anonymous password change", async () => {
    const res = await request(app)
      .post("/api/auth/password")
      .send({ currentPassword: "whatever", newPassword: "replacement123" });
    expect(res.status).toBe(401);
  });
});
