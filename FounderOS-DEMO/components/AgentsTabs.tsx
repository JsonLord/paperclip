'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

/**
 * /agents tab shell — "Roster" is the OS's own agent runtime (children,
 * server-rendered); "Hermes" embeds a stock worker-pool dashboard from
 * whatever host HERMES_DASH_URL points at. We embed rather than rebuild so
 * dashboard updates never cost us UI work. The iframe mounts on first
 * activation only (visited flag) and stays mounted after, so switching back is
 * instant and /agents never pays the dashboard load cost unless the tab is
 * used. With no HERMES_DASH_URL configured the tab says so honestly rather
 * than embedding a dead frame.
 */
export function AgentsTabs({ hermesUrl, children }: { hermesUrl?: string; children: React.ReactNode }) {
  const [tab, setTab] = useState<'roster' | 'hermes'>('roster');
  const [visited, setVisited] = useState(false);
  const configured = Boolean(hermesUrl);

  const openHermes = () => {
    setTab('hermes');
    setVisited(true);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-os-border">
        {(
          [
            ['roster', 'Roster', () => setTab('roster')],
            ['hermes', 'Hermes Workers', openHermes],
          ] as const
        ).map(([id, label, onClick]) => (
          <button
            key={id}
            onClick={onClick}
            className={`-mb-px border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
              tab === id
                ? 'border-os-text text-os-text'
                : 'border-transparent text-os-dim hover:text-os-muted'
            }`}
          >
            {label}
          </button>
        ))}
        {tab === 'hermes' && configured && (
          <a
            href={hermesUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 px-2 font-mono text-[10px] text-os-dim transition-colors hover:text-os-text"
          >
            Open full dashboard <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Roster stays mounted always (server-rendered content must not remount) */}
      <div className={tab === 'roster' ? '' : 'hidden'}>{children}</div>

      {/* Hermes dashboard — lazy first mount, then kept alive */}
      {visited && (
        <div className={tab === 'hermes' ? '' : 'hidden'}>
          {configured ? (
            <>
              <iframe
                src={hermesUrl}
                title="Hermes worker-pool dashboard"
                className="h-[calc(100dvh-14rem)] min-h-[480px] w-full rounded-lg border border-os-border bg-os-bg"
              />
              <div className="mt-1.5 font-mono text-[9.5px] text-os-dim">
                Stock Hermes dashboard, embedded live from the worker-pool host. Blank or erroring?
                The dashboard process may be down (the proxy answers 502).
              </div>
            </>
          ) : (
            <div className="flex h-[calc(100dvh-14rem)] min-h-[480px] w-full items-center justify-center rounded-lg border border-os-border bg-os-bg">
              <div className="max-w-sm text-center">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-os-muted">
                  Not configured
                </div>
                <div className="mt-2 font-mono text-[10px] leading-relaxed text-os-dim">
                  Set HERMES_DASH_URL to the worker-pool dashboard and it embeds here.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
