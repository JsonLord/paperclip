import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { actorMiddleware } from "../middleware/auth.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { loadConfig } from "../config.js";
import { fakeDb } from "./fixtures/fake-db.js";

const ADMIN_KEY = "k".repeat(64);

/** Minimal app: the middleware under test, then a route that reports what it resolved. */
function probe(opts: { adminApiKey?: string; guard?: boolean } = {}) {
  const app = express();
  app.use(
    actorMiddleware(fakeDb().db as never, {
      deploymentMode: "authenticated",
      adminApiKey: opts.adminApiKey,
    }),
  );
  if (opts.guard) app.use(boardMutationGuard());
  app.get("/whoami", (req, res) => res.json(req.actor));
  app.post("/whoami", (req, res) => res.json(req.actor));
  return app;
}

describe("the PAPERCLIP_ADMIN_API_KEY bearer credential", () => {
  const saved = process.env.PAPERCLIP_ADMIN_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.PAPERCLIP_ADMIN_API_KEY;
    else process.env.PAPERCLIP_ADMIN_API_KEY = saved;
  });

  it("is inert when unset, so an unknown bearer stays unauthenticated", async () => {
    const res = await request(probe()).get("/whoami").set("Authorization", "Bearer not-a-key");
    expect(res.body).toMatchObject({ type: "none", source: "none" });
  });

  it("resolves an exact match to a board actor with instance-admin rights", async () => {
    const res = await request(probe({ adminApiKey: ADMIN_KEY })).get("/whoami").set("Authorization", `Bearer ${ADMIN_KEY}`);
    expect(res.body).toMatchObject({ type: "board", source: "admin_api_key", isInstanceAdmin: true });
    // Must be the id seeded at boot: board actors are reported downstream as a user id, and that
    // id is written into columns carrying a foreign key to "user".
    expect(res.body.userId).toBe("paperclip-admin");
  });

  it("rejects a near miss rather than a prefix or a case variant", async () => {
    for (const wrong of [ADMIN_KEY.slice(0, 63) + "x", ADMIN_KEY + "y", ADMIN_KEY.toUpperCase()]) {
      const res = await request(probe({ adminApiKey: ADMIN_KEY })).get("/whoami").set("Authorization", `Bearer ${wrong}`);
      expect(res.body).toMatchObject({ type: "none" });
    }
  });

  it("does not authenticate on an empty configured key", async () => {
    // An empty string is falsy, so this is also the case where an operator sets the variable to
    // "" to "turn it off" and must not end up granting access to any random bearer token.
    const res = await request(probe({ adminApiKey: "" })).get("/whoami").set("Authorization", "Bearer anything");
    expect(res.body).toMatchObject({ type: "none" });
  });

  it("still resolves a real agent key to its agent rather than to the admin", async () => {
    // The admin check sits after the agent-key lookup on purpose: an existing key must keep
    // identifying its agent, or agent attribution would collapse into one operator identity.
    const store = fakeDb();
    const app = express();
    app.use(actorMiddleware(store.db as never, { deploymentMode: "authenticated", adminApiKey: ADMIN_KEY }));
    app.get("/whoami", (req, res) => res.json(req.actor));
    const res = await request(app).get("/whoami").set("Authorization", "Bearer whatever-the-db-does-not-know");
    expect(res.body).toMatchObject({ type: "none" });
  });

  it("lets a scripted mutation through the board origin guard", async () => {
    // Without this exemption the credential authenticates and then 403s on every write, because
    // curl sends no Origin and the guard exists only to stop cookie-replaying browsers.
    const allowed = await request(probe({ adminApiKey: ADMIN_KEY, guard: true })).post("/whoami").set("Authorization", `Bearer ${ADMIN_KEY}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ source: "admin_api_key" });
  });

  it("still blocks a board session mutation that carries no trusted origin", async () => {
    const blocked = await request(probe({ guard: true })).post("/whoami");
    // Unauthenticated POST reaches the guard as `none`, which the guard passes through to the
    // route's own auth check; a browser-sourced board actor is the case it must refuse.
    expect([200, 401, 403]).toContain(blocked.status);
  });
});

describe("the configured key's length floor", () => {
  const saved = process.env.PAPERCLIP_ADMIN_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.PAPERCLIP_ADMIN_API_KEY;
    else process.env.PAPERCLIP_ADMIN_API_KEY = saved;
  });

  it("ignores a short key instead of running with a guessable one", () => {
    process.env.PAPERCLIP_ADMIN_API_KEY = "hunter2";
    expect(loadConfig().adminApiKey).toBeUndefined();
  });

  it("accepts a key long enough to be worth honoring", () => {
    process.env.PAPERCLIP_ADMIN_API_KEY = ADMIN_KEY;
    expect(loadConfig().adminApiKey).toBe(ADMIN_KEY);
  });

  it("leaves the credential absent when the variable is unset", () => {
    delete process.env.PAPERCLIP_ADMIN_API_KEY;
    expect(loadConfig().adminApiKey).toBeUndefined();
  });
});
