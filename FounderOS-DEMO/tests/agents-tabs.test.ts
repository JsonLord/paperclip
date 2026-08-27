import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /agents carries a Hermes worker-pool dashboard as a TAB (2026-08-05): embed
 * the stock dashboard via iframe rather than rebuilding its UI (the
 * update-chasing trap). The iframe mounts lazily on first tab activation so
 * /agents never pays the dashboard's load cost by default, and the URL comes
 * from env (HERMES_DASH_URL) with NO host baked into the source.
 */
describe('agents Hermes tab', () => {
  test('AgentsTabs is a client component with Roster + Hermes tabs and a lazy iframe', () => {
    const src = read('components/AgentsTabs.tsx');
    expect(src).toContain("'use client'");
    expect(src).toContain('Roster');
    expect(src).toContain('Hermes');
    expect(src).toContain('<iframe');
    // lazy mount: iframe only renders once the tab has been visited
    expect(src).toMatch(/visited|mounted|activated/i);
    // external escape hatch — open the dashboard in its own tab
    expect(src).toContain('target="_blank"');
  });

  test('an unconfigured dashboard reports itself instead of embedding a dead frame', () => {
    const src = read('components/AgentsTabs.tsx');
    expect(src).toMatch(/configured/i);
    expect(src).toContain('HERMES_DASH_URL');
  });

  test('the agents page wraps its body in AgentsTabs with the env-driven URL', () => {
    const page = read('app/agents/page.tsx');
    expect(page).toContain('AgentsTabs');
    expect(page).toContain('HERMES_DASH_URL');
  });

  test('no host is hardcoded anywhere in the tab shell or the page', () => {
    for (const p of ['components/AgentsTabs.tsx', 'app/agents/page.tsx']) {
      const src = read(p);
      expect(src, `${p} must not pin a host`).not.toMatch(/ts\.net|https?:\/\/[a-z0-9.-]+:\d+/i);
    }
  });
});
