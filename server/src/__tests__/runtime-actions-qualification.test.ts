import { describe, it, expect, vi } from "vitest";
import {
  githubActionsProvider,
  normalizeActionsResult,
} from "../services/validation/github-actions.js";
import { isEngineeringDependency } from "../services/validation/engineering-boundary.js";
import { resolveValidationRuntime } from "../services/validation/runtime.js";
import { validationTaskSchema } from "@paperclipai/shared";
describe("Actions exact provider correlation", () => {
  it("ignores loose and unrelated titles, searching beyond the first page", async () => {
    const wrong = Array.from({ length: 100 }, (_, id) => ({
      id,
      display_title: "paperclip:run-extra",
    }));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: wrong })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [{ id: 999, display_title: "paperclip:run" }],
          }),
        ),
      );
    expect(
      (
        await githubActionsProvider(fetcher).find(
          "acme/repo",
          "analysis.yml",
          "paperclip:run",
          "fixture",
        )
      )?.id,
    ).toBe(999);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects matching duplicates on separate pages without choosing a winner", async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({
      id,
      display_title: id === 0 ? "paperclip:run" : "unrelated",
    }));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: first })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [{ id: 999, display_title: "paperclip:run" }],
          }),
        ),
      );
    await expect(
      githubActionsProvider(fetcher).find(
        "acme/repo",
        "analysis.yml",
        "paperclip:run",
        "fixture",
      ),
    ).rejects.toThrow(/Ambiguous/);
  });
  it.each(["failure", "cancelled", "timed_out", "skipped", "action_required"])(
    "does not report %s as success",
    (conclusion) =>
      expect(
        normalizeActionsResult({
          id: 1,
          status: "completed",
          conclusion,
          display_title: "paperclip:x",
          html_url: "https://github.com/acme/repo/actions/runs/1",
        }).succeeded,
      ).toBe(false),
  );
});
describe("engineering intent and positive frontend controls", () => {
  it.each([
    "Build a production backend, database, authentication service and API",
    "Implement a database schema",
    "Create an authentication service",
    "Build an API",
    "Refactor product-engineering infrastructure",
  ])("intercepts %s", (title) =>
    expect(isEngineeringDependency({ title })).toBe(true),
  );
  it("preserves frontend-only fake doors with a negative backend boundary", () =>
    expect(
      isEngineeringDependency({
        title:
          "Build a frontend-only fake door; no backend, database or API changes",
      }),
    ).toBe(false));
  it.each([
    ["analysis", "github-actions"],
    ["experiment_evaluation", "github-actions"],
    ["community_exploration", "hermes_local"],
    ["fake_door", "jules"],
    ["landing_page", "jules"],
    ["visual", "jules"],
    ["demo", "jules"],
    ["product_backend", null],
  ])("resolves %s without substituting another runtime", (workClass, runtime) =>
    expect(
      resolveValidationRuntime(validationTaskSchema.parse({ workClass }))
        .runtime,
    ).toBe(runtime),
  );
});
