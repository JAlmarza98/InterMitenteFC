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
  const agent = await loginAs(app, user.email, password);
  return { agent, admin: user };
}

describe("admin user management", () => {
  it("lists users filtered by status", async () => {
    const { agent } = await adminAgent();
    await createApprovedUser("member"); // approved, not pending

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "pending@example.com", password: "supersecret1", name: "Pending Person" });
    expect(registerRes.status).toBe(201);

    const pendingRes = await agent.get("/api/admin/users?status=pending");
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.users).toHaveLength(1);
    expect(pendingRes.body.users[0].email).toBe("pending@example.com");
    expect(pendingRes.body.users[0].passwordHash).toBeUndefined();
  });

  it("approves a pending user", async () => {
    const { agent } = await adminAgent();
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "newbie@example.com", password: "supersecret1", name: "Newbie" });
    const pendingId = registerRes.body.user.id;

    const approveRes = await agent.patch(`/api/admin/users/${pendingId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.user.status).toBe("approved");
  });

  it("rejects a user", async () => {
    const { agent } = await adminAgent();
    const { user: target } = await createApprovedUser("member");

    const rejectRes = await agent.patch(`/api/admin/users/${target.id}/reject`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.user.status).toBe("rejected");
  });

  it("changes a user's role", async () => {
    const { agent } = await adminAgent();
    const { user: target } = await createApprovedUser("member");

    const roleRes = await agent.patch(`/api/admin/users/${target.id}/role`).send({ role: "coach" });
    expect(roleRes.status).toBe(200);
    expect(roleRes.body.user.role).toBe("coach");
  });

  it("refuses to let an admin approve, reject or re-role themselves", async () => {
    const { agent, admin } = await adminAgent();

    const approveSelf = await agent.patch(`/api/admin/users/${admin.id}/approve`);
    expect(approveSelf.status).toBe(400);

    const rejectSelf = await agent.patch(`/api/admin/users/${admin.id}/reject`);
    expect(rejectSelf.status).toBe(400);

    const reRoleSelf = await agent.patch(`/api/admin/users/${admin.id}/role`).send({ role: "member" });
    expect(reRoleSelf.status).toBe(400);
  });

  it("blocks a non-admin from every user-management endpoint", async () => {
    const { user, password } = await createApprovedUser("coach");
    const agent = await loginAs(app, user.email, password);

    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});
