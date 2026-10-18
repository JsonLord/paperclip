import { describe, it, expect, vi } from "vitest";
import {
  nodepadCandidateSchema,
  type NodepadCandidate,
} from "@paperclipai/shared";
import {
  dispatchNodepadCandidate,
  nodepadHttpProvider,
  type NodepadBinding,
  type NodepadCandidateInput,
  type NodepadProvider,
} from "../services/validation/nodepad.js";
import { nodepadCandidates } from "./fixtures/nodepad-candidates.js";
const binding: NodepadBinding = {
  companyId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "workspace-a",
  baseUrl: "https://nodepad.example/api/v1",
  apiKeySecretRef: "10000000-0000-4000-8000-000000000002",
};
const receipt = {
  candidateId: "candidate:1",
  companyId: binding.companyId,
  workspaceId: binding.workspaceId,
};
const input = (candidate: NodepadCandidate): NodepadCandidateInput => ({
  actorId: "specialist:1",
  companyId: binding.companyId,
  workspaceId: binding.workspaceId,
  candidate,
});
describe("typed Nodepad evidence contract", () => {
  it.each(nodepadCandidates)(
    "validates the $type discriminant and rejects canonical mutation fields",
    (candidate) => {
      expect(nodepadCandidateSchema.parse(candidate)).toEqual(candidate);
      for (const field of [
        "qualification",
        "confidence",
        "band",
        "status",
        "endpoint",
        "operation",
      ]) {
        expect(() =>
          nodepadCandidateSchema.parse({ ...candidate, [field]: "forged" }),
        ).toThrow();
      }
    },
  );
  it("rejects untagged legacy evidence, unknown types and incomplete provenance", () => {
    const { type, ...legacy } = nodepadCandidates[0];
    expect(() => nodepadCandidateSchema.parse(legacy)).toThrow();
    expect(() =>
      nodepadCandidateSchema.parse({ ...legacy, type: "other" }),
    ).toThrow();
    for (const key of ["sourceRef", "contentHash", "pipelineRunRef"]) {
      const value = { ...nodepadCandidates[0] } as Record<string, unknown>;
      delete value[key];
      expect(() => nodepadCandidateSchema.parse(value)).toThrow();
    }
  });
  it.each(nodepadCandidates)(
    "routes $type only to its explicit bridge operation",
    async (candidate) => {
      const fetcher = vi.fn(
        async () => new Response(JSON.stringify(receipt), { status: 201 }),
      );
      await dispatchNodepadCandidate(
        nodepadHttpProvider(fetcher as typeof fetch),
        binding,
        "fixture-key",
        input(candidate),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, request] = fetcher.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      const paths: Record<NodepadCandidate["type"], string> = {
        evidence_submission: "evidence",
        research_gap: "research-gaps",
        hypothesis_proposal: "hypotheses",
        counter_hypothesis: "counter-hypotheses",
        experiment_spec: "experiments/specifications",
        experiment_result: "experiments/results",
      };
      expect(new URL(url).pathname).toBe(
        `/api/v1/workspaces/workspace-a/${paths[candidate.type]}`,
      );
      expect(JSON.parse(request.body as string)).toEqual(input(candidate));
      expect(request.method).toBe("POST");
      expect(request.redirect).toBe("error");
      if (candidate.type === "evidence_submission")
        expect(url).not.toMatch(/\/hypotheses(?:\/|$)/);
    },
  );
  it.each([404, 405, 422, 500, 503])(
    "never falls back to /hypotheses when evidence returns HTTP %s",
    async (status) => {
      const fetcher = vi.fn(
        async () => new Response("unavailable", { status }),
      );
      await expect(
        dispatchNodepadCandidate(
          nodepadHttpProvider(fetcher as typeof fetch),
          binding,
          "fixture-key",
          input(nodepadCandidates[0]),
        ),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("/hypotheses");
    },
  );
  it("never falls back when the evidence operation is missing", async () => {
    const hypothesis = vi.fn(async () => receipt),
      provider = {
        mode: "live",
        proposeHypothesis: hypothesis,
      } as unknown as NodepadProvider;
    expect(() =>
      dispatchNodepadCandidate(
        provider,
        binding,
        "fixture-key",
        input(nodepadCandidates[0]),
      ),
    ).toThrow(/submitEvidence/);
    expect(hypothesis).not.toHaveBeenCalled();
  });
  it("rejects attempts to smuggle evidence through the hypothesis operation before HTTP", async () => {
    const fetcher = vi.fn(
        async () => new Response(JSON.stringify(receipt), { status: 201 }),
      ),
      provider = nodepadHttpProvider(fetcher as typeof fetch);
    // @ts-expect-error Runtime validation must also protect untyped JS callers.
    await expect(
      provider.proposeHypothesis(
        binding,
        "fixture-key",
        input(nodepadCandidates[0]),
      ),
    ).rejects.toThrow(/type/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-workspace input and receipts", async () => {
    const fetcher = vi.fn(
        async () =>
          new Response(JSON.stringify({ ...receipt, workspaceId: "other" }), {
            status: 201,
          }),
      ),
      provider = nodepadHttpProvider(fetcher as typeof fetch);
    await expect(
      provider.submitEvidence(binding, "fixture-key", {
        ...input(nodepadCandidates[0]),
        workspaceId: "other",
      } as NodepadCandidateInput<
        Extract<NodepadCandidate, { type: "evidence_submission" }>
      >),
    ).rejects.toThrow(/boundary/);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      dispatchNodepadCandidate(
        provider,
        binding,
        "fixture-key",
        input(nodepadCandidates[0]),
      ),
    ).rejects.toThrow(/boundary/);
  });
});
