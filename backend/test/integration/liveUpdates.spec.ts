import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { AddressInfo } from "node:net";
import request from "supertest";
import { app } from "../../src/app";
import { resetDb } from "../helpers/db";
import { createApprovedUser } from "../helpers/auth";

beforeEach(async () => {
  await resetDb();
});

describe("live updates stream", () => {
  it("is off-limits without a session", async () => {
    const res = await request(app).get("/api/live-updates");
    expect(res.status).toBe(401);
  });

  it("streams as any authenticated member", async () => {
    const { user, password } = await createApprovedUser("member");
    const loginRes = await request(app).post("/api/auth/login").send({ email: user.email, password });
    const cookie = loginRes.headers["set-cookie"]![0];

    // The stream never ends on its own (that's the point), and supertest's
    // superagent wrapper doesn't surface the raw HTTP `response` event
    // until it's done buffering a body that here never arrives — so this
    // uses a real listening server + Node's http client directly, which
    // fires its `response` callback as soon as headers arrive regardless
    // of whether the body ever completes.
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const { status, contentType } = await new Promise<{ status: number; contentType?: string }>(
        (resolve, reject) => {
          const req = http.get(
            { host: "127.0.0.1", port, path: "/api/live-updates", headers: { Cookie: cookie } },
            (res) => {
              resolve({ status: res.statusCode!, contentType: res.headers["content-type"] });
              req.destroy();
            }
          );
          req.on("error", (err) => {
            // Destroying the still-open connection above raises an ECONNRESET
            // here on some platforms — expected once we've already resolved.
            if (!err.message.includes("ECONNRESET") && !err.message.includes("socket hang up")) reject(err);
          });
        }
      );

      expect(status).toBe(200);
      expect(contentType).toContain("text/event-stream");
    } finally {
      server.close();
    }
  });
});
