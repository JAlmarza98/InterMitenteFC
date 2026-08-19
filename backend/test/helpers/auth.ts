import bcrypt from "bcryptjs";
import request from "supertest";
import { Express } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../src/db/prisma";

let counter = 0;

const PASSWORD = "testpassword123";

/** Inserts an approved user directly (bypassing the register/approve flow)
 * with a known plaintext password, for tests that need a ready-to-login
 * account without exercising the registration flow itself. */
export async function createApprovedUser(role: UserRole = "member") {
  counter += 1;
  const email = `test-user-${counter}-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash(PASSWORD, 4); // low cost factor: tests only
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `Test User ${counter}`,
      role,
      status: "approved",
      approvedAt: new Date(),
    },
  });
  return { user, password: PASSWORD };
}

/** Logs in as `user` via the real /api/auth/login endpoint and returns a
 * supertest agent that carries the resulting session cookie on every
 * subsequent request. */
export async function loginAs(app: Express, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}
