import { describe, expect, it, vi } from "vitest";
import { CompanyContextCache, COMPANY_SCOPE_KEY } from "../services/company-context-cache.ts";

function entry(content: string | null, generatedAt: number) {
  return { content, sourceRef: null, generatedAt };
}

describe("CompanyContextCache", () => {
  it("stores and reads entries scoped by company and scope key", () => {
    const cache = new CompanyContextCache();
    cache.set("company-a", "project-1", entry("a1", 100));
    cache.set("company-a", null, entry("a-company", 100));
    cache.set("company-b", "project-1", entry("b1", 100));

    expect(cache.peek("company-a", "project-1")?.content).toBe("a1");
    expect(cache.peek("company-a", null)?.content).toBe("a-company");
    expect(cache.peek("company-a", COMPANY_SCOPE_KEY)?.content).toBe("a-company");
    expect(cache.peek("company-b", "project-1")?.content).toBe("b1");
    expect(cache.peek("company-a", "missing")).toBeUndefined();
  });

  it("isolates companies — evicting one leaves the other intact", () => {
    const cache = new CompanyContextCache();
    cache.set("company-a", null, entry("a", 1));
    cache.set("company-b", null, entry("b", 1));

    cache.invalidateCompany("company-a");

    expect(cache.peek("company-a", null)).toBeUndefined();
    expect(cache.peek("company-b", null)?.content).toBe("b");
  });

  it("invalidateScope only evicts the targeted scope", () => {
    const cache = new CompanyContextCache();
    cache.set("c", "p1", entry("p1", 1));
    cache.set("c", "p2", entry("p2", 1));

    cache.invalidateScope("c", "p1");

    expect(cache.peek("c", "p1")).toBeUndefined();
    expect(cache.peek("c", "p2")?.content).toBe("p2");
  });

  it("isFresh respects the max age window", () => {
    const cache = new CompanyContextCache();
    cache.set("c", null, entry("x", 1_000));

    expect(cache.isFresh("c", null, 500, 1_400)).toBe(true);
    expect(cache.isFresh("c", null, 500, 1_500)).toBe(false);
    expect(cache.isFresh("c", null, 500, 1_600)).toBe(false);
    expect(cache.isFresh("missing", null, 500, 1_000)).toBe(false);
  });

  it("getOrLoad returns the cached value without calling the loader when fresh", async () => {
    const cache = new CompanyContextCache();
    cache.set("c", null, entry("cached", 1_000));
    const loader = vi.fn(async () => entry("fresh", 2_000));

    const result = await cache.getOrLoad("c", null, 5_000, loader, 1_100);

    expect(result?.content).toBe("cached");
    expect(loader).not.toHaveBeenCalled();
  });

  it("getOrLoad invokes the loader on a stale entry and stores the result", async () => {
    const cache = new CompanyContextCache();
    cache.set("c", null, entry("stale", 1_000));
    const loader = vi.fn(async () => entry("fresh", 9_000));

    const result = await cache.getOrLoad("c", null, 500, loader, 9_000);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result?.content).toBe("fresh");
    expect(cache.peek("c", null)?.content).toBe("fresh");
  });

  it("getOrLoad does not cache a null loader result", async () => {
    const cache = new CompanyContextCache();
    const loader = vi.fn(async () => null);

    const result = await cache.getOrLoad("c", null, 500, loader, 1_000);

    expect(result).toBeNull();
    expect(cache.peek("c", null)).toBeUndefined();
  });

  it("tracks hit/miss stats", () => {
    const cache = new CompanyContextCache();
    cache.set("c", null, entry("x", 1));
    cache.get("c", null); // hit
    cache.get("c", "nope"); // miss

    const stats = cache.stats();
    expect(stats.companies).toBe(1);
    expect(stats.entries).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
