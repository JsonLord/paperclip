import { describe, expect, it } from "vitest";
import { listAdapterModels, listServerAdapters } from "../adapters/index.js";

describe("FounderOS adapter registry", () => {
  it("exposes only Hermes and Jules", () => {
    expect(listServerAdapters().map((adapter) => adapter.type)).toEqual(["hermes_local", "jules"]);
  });

  it("returns Hermes models and no fixed Jules model list", async () => {
    expect((await listAdapterModels("hermes_local")).length).toBeGreaterThan(0);
    expect(await listAdapterModels("jules")).toEqual([]);
  });

  it("returns an empty list for unavailable adapters", async () => {
    expect(await listAdapterModels("codex_local")).toEqual([]);
    expect(await listAdapterModels("unknown_adapter")).toEqual([]);
  });
});
