import type { Db } from "@paperclipai/db";

/**
 * An in-memory stand-in for the Drizzle client that honours simple `eq`/`and`
 * conditions, so a test can tell company-scoped behaviour from an unfiltered read.
 *
 * Conditions are read out of Drizzle's `queryChunks`, which is internal. If that
 * shape ever changes the walker finds no pairs and the condition degrades to
 * "match everything" — the behaviour of the ad-hoc fakes this replaces — rather
 * than failing in a way that looks like a product bug.
 */
type Row = Record<string, any>;

function equalityPairs(condition: any): Array<{ column: any; value: unknown }> {
  const pairs: Array<{ column: any; value: unknown }> = [];
  const walk = (node: any) => {
    const chunks: any[] = node?.queryChunks ?? [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (chunk?.queryChunks) { walk(chunk); continue; }
      const next = chunks[index + 2];
      const isColumn = chunk && typeof chunk === "object" && "name" in chunk && "table" in chunk;
      if (isColumn && next && typeof next === "object" && "value" in next && !("queryChunks" in next)) pairs.push({ column: chunk, value: next.value });
    }
  };
  walk(condition);
  return pairs;
}

function matches(table: any, row: Row, condition: any): boolean {
  const pairs = equalityPairs(condition);
  if (!pairs.length) return true;
  return pairs.every(({ column, value }) => {
    const key = Object.keys(table).find((candidate) => table[candidate] === column);
    return key === undefined || row[key] === value;
  });
}

export function fakeDb(seed: Array<[unknown, Row[]]> = []) {
  const rows = new Map<unknown, Row[]>(seed);
  let id = 0;
  const rowsOf = (table: unknown) => { const existing = rows.get(table); if (existing) return existing; const created: Row[] = []; rows.set(table, created); return created };

  const select = () => {
    let table: any = null;
    let selected: Row[] = [];
    const query: any = {
      from: (t: unknown) => { table = t; selected = [...(rows.get(t) ?? [])]; return query },
      where: (condition: any) => { selected = selected.filter((row) => matches(table, row, condition)); return query },
      limit: (n: number) => { selected = selected.slice(0, n); return query },
      orderBy: () => query,
      then: (ok: any, bad: any) => Promise.resolve(selected).then(ok, bad),
    };
    return query;
  };

  const db: any = {
    select,
    transaction: (fn: any) => fn(db),
    insert: (table: unknown) => ({
      values: (value: any) => {
        const made = (Array.isArray(value) ? value : [value]).map((v) => ({ id: v.id ?? `id-${++id}`, ...v }));
        const target = rowsOf(table);
        const op: any = {
          onConflictDoNothing: () => op,
          onConflictDoUpdate: () => op,
          returning: async () => { target.push(...made); return made },
          then: (ok: any) => Promise.resolve(target.push(...made)).then(ok),
        };
        return op;
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: (condition: any) => {
          const touched = rowsOf(table).filter((row) => matches(table, row, condition));
          for (const row of touched) Object.assign(row, patch);
          const op: any = { returning: async () => touched, then: (ok: any) => Promise.resolve(undefined).then(ok) };
          return op;
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (condition: any) => {
        const kept = rowsOf(table).filter((row) => !matches(table, row, condition));
        rows.set(table, kept);
        return { then: (ok: any) => Promise.resolve(undefined).then(ok) };
      },
    }),
  };

  return { db: db as Db, rows };
}
