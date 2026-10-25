import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { issueService } from "../services/issues.js";
import { fakeDb } from "./fixtures/fake-db.js";

const roster = (names: string[]) => names.map((name, index) => ({ id: `a-${index}`, companyId: "co", name }));
const mentions = async (names: string[], body: string) => {
  const store = fakeDb([[agents, roster(names)]]);
  const found = await issueService(store.db as Db).findMentionedAgents("co", body);
  const byId = new Map(roster(names).map((row) => [row.id, row.name]));
  return found.map((id) => byId.get(id));
};

describe("resolving @-mentions to the agents they name", () => {
  it("resolves a multi-word name, which the original could not", async () => {
    // The original swept one whitespace-delimited token per `@`, so "@Document Compiler" produced
    // the token "document", matched nothing, and woke nobody — silently, from both the board and
    // the agent-facing comment route. Every FounderOS role has a multi-word name, which meant no
    // agent could hand work back to the colleague that asked for it.
    expect(await mentions(["Document Compiler"], "comment and mention @Document Compiler when done")).toEqual(["Document Compiler"]);
  });

  it("resolves the names the actual workforce uses", async () => {
    const fleet = ["Data Presentationalist", "PDF Engine Architect", "Behavioral Nudge Engine", "Future Researcher"];
    expect(await mentions(fleet, "cc @Data Presentationalist and @PDF Engine Architect")).toEqual(["Data Presentationalist", "PDF Engine Architect"]);
  });

  it("still resolves a single-word name, and punctuation does not swallow it", async () => {
    expect(await mentions(["Leon"], "ping @Leon, please")).toEqual(["Leon"]);
    expect(await mentions(["Leon"], "@Leon." )).toEqual(["Leon"]);
  });

  it("does not wake a shorter agent whose name sits inside a longer mention", async () => {
    // Mentioning "Agent Lee" must not also wake an unrelated agent called "Lee". Longest match
    // wins and its span is claimed, which is the only ordering that makes this predictable.
    expect(await mentions(["Lee", "Agent Lee"], "hand this to @Agent Lee")).toEqual(["Agent Lee"]);
  });

  it("does not treat an email address as a mention", async () => {
    // `\B` before the `@` is what preserves this. Dropping it would wake an agent named "dotta"
    // every time someone pasted an email into a comment thread.
    const store = fakeDb([[agents, roster(["dotta"])]]);
    expect(await issueService(store.db as Db).findMentionedAgents("co", "sent to bippadotta@dotta.example already")).toEqual([]);
  });

  it("does not match an agent name embedded inside a longer word", async () => {
    expect(await mentions(["Lee"], "the @Leanne case is different")).toEqual([]);
  });

  it("ignores a nameless agent row instead of matching everything", async () => {
    const store = fakeDb([[agents, [{ id: "a-1", companyId: "co", name: null }, { id: "a-2", companyId: "co", name: "" }]]]);
    expect(await issueService(store.db as Db).findMentionedAgents("co", "random @ someone in text")).toEqual([]);
  });

  it("returns nothing early when the comment has no @ at all", async () => {
    // The common case is a plain comment; it should not cost a fleet-wide query.
    const store = fakeDb([[agents, roster(["Document Compiler"])]]);
    expect(await issueService(store.db as Db).findMentionedAgents("co", "no mentions here")).toEqual([]);
  });

  it("escapes a name containing regex syntax rather than crashing or over-matching", async () => {
    expect(await mentions(["Growth (GTM) Lead"], "ask @Growth (GTM) Lead")).toEqual(["Growth (GTM) Lead"]);
    expect(await mentions(["Growth (GTM) Lead"], "ask @GrowthXGTMxLead")).toEqual([]);
  });
});
