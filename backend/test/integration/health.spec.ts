import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("health check", () => {
  it("reports ok with a working DB connection", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });
});
