/**
 * The board.
 *
 * This is the only part of the game that faces the internet and the only part
 * a stranger can write to, so the checks here are mostly about what it refuses.
 * A leaderboard that accepts what it is told is not a leaderboard for very
 * long — the first version of any of these ends up full of `999999999`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { openDb, type Db } from '../src/db.js';
import { createApi } from '../src/server.js';
import { lootCeiling } from '../src/verify.js';

const DATE = '2026-08-12';
const NOW = Date.parse(`${DATE}T12:00:00Z`);

let db: Db;
let server: Server;
let base: string;

beforeEach(async () => {
  db = openDb(':memory:');
  server = createServer(createApi(db, () => NOW));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
});

const post = (body: unknown): Promise<Response> =>
  fetch(`${base}/board`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = (q: string): Promise<Response> => fetch(`${base}/board?${q}`);

const claim = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  pid: 'aaaaaaaa1111',
  name: 'Alfa',
  date: DATE,
  depth: 1,
  loot: 900,
  verdict: 'CLEAN',
  ...over,
});

describe('taking a score', () => {
  it('accepts an honest run and puts it on the board', async () => {
    const r = await post(claim());
    expect(r.status).toBe(200);
    const b = (await r.json()) as { top: { n: string; s: number }[]; rank: number; players: number };
    expect(b.top).toEqual([{ n: 'Alfa', s: 900, you: true }]);
    expect(b.rank).toBe(1);
    expect(b.players).toBe(1);
  });

  it('refuses more gold than the lair contains', async () => {
    const ceiling = lootCeiling(DATE, 1);
    const r = await post(claim({ loot: ceiling + 1 }));
    expect(r.status).toBe(400);
    expect((await r.json()) as { error: string }).toEqual({ error: `that lair holds ${ceiling}` });
  });

  it('accepts a run that took every coin in it — the ceiling is reachable, not theoretical', async () => {
    const r = await post(claim({ loot: lootCeiling(DATE, 1) }));
    expect(r.status).toBe(200);
  });

  it('refuses a night that is not open', async () => {
    for (const date of ['2026-08-01', '2026-09-01']) {
      const r = await post(claim({ date }));
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toBe('that night is closed');
    }
  });

  it('allows the night either side, because runs cross midnight', async () => {
    for (const date of ['2026-08-11', '2026-08-13']) {
      expect((await post(claim({ date }))).status).toBe(200);
    }
  });

  it('refuses nonsense in every field it reads', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['bad pid', { pid: 'no' }],
      ['bad pid', { pid: 'Robert"); DROP TABLE scores;--' }],
      ['a run needs a name on it', { name: '   ' }],
      ['bad depth', { depth: 0 }],
      ['bad depth', { depth: 1.5 }],
      ['bad loot', { loot: -1 }],
      ['bad loot', { loot: Number.NaN }],
    ];
    for (const [why, over] of bad) {
      const r = await post(claim(over));
      expect(r.status, JSON.stringify(over)).toBe(400);
      expect(((await r.json()) as { error: string }).error, JSON.stringify(over)).toBe(why);
    }
  });

  it('survives a body that is not JSON at all', async () => {
    const r = await fetch(`${base}/board`, { method: 'POST', body: 'not json' });
    expect(r.status).toBe(400);
  });

  it('keeps a player’s best run of the night, not their latest', async () => {
    await post(claim({ loot: 1200 }));
    const r = await post(claim({ loot: 300 }));
    const b = (await r.json()) as { changed: boolean; me: { s: number } };
    expect(b.changed).toBe(false);
    expect(b.me.s).toBe(1200);
  });

  it('still follows a rename, even on a worse run', async () => {
    await post(claim({ loot: 1200, name: 'Alfa' }));
    await post(claim({ loot: 300, name: 'Sable' }));
    const b = (await (await get(`date=${DATE}&depth=1`)).json()) as { top: { n: string }[] };
    expect(b.top[0]?.n).toBe('Sable');
  });

  it('keeps one row per player, however many runs they post', async () => {
    for (let i = 0; i < 5; i++) await post(claim({ loot: 100 + i }));
    const b = (await (await get(`date=${DATE}&depth=1`)).json()) as { players: number };
    expect(b.players).toBe(1);
  });
});

describe('reading the board', () => {
  const field = async (): Promise<void> => {
    await post(claim({ pid: 'bbbbbbbb2222', name: 'Rats', loot: 1500 }));
    await post(claim({ pid: 'cccccccc3333', name: 'Wick', loot: 1100 }));
    await post(claim({ pid: 'dddddddd4444', name: 'Sable', loot: 400 }));
  };

  it('ranks by gold, biggest first', async () => {
    await field();
    const b = (await (await get(`date=${DATE}&depth=1`)).json()) as { top: { n: string; s: number }[] };
    expect(b.top.map((r) => r.n)).toEqual(['Rats', 'Wick', 'Sable']);
  });

  it('marks the row that belongs to whoever is asking', async () => {
    await field();
    const b = (await (await get(`date=${DATE}&depth=1&pid=cccccccc3333`)).json()) as {
      top: { n: string; you?: boolean }[];
      rank: number;
    };
    expect(b.top.find((r) => r.you)?.n).toBe('Wick');
    expect(b.rank).toBe(2);
  });

  it('tells a player their rank even when they are nowhere near the top', async () => {
    await field();
    for (let i = 0; i < 12; i++) await post(claim({ pid: `zzzz${String(i).padStart(8, '0')}`, name: `T${i}`, loot: 2000 + i }));
    const b = (await (await get(`date=${DATE}&depth=1&pid=dddddddd4444`)).json()) as {
      top: unknown[];
      me: { n: string };
      rank: number;
    };
    expect(b.top).toHaveLength(10);
    expect(b.me.n).toBe('Sable');
    expect(b.rank).toBe(15);
  });

  it('keeps each depth on its own board', async () => {
    await post(claim({ depth: 1, loot: 900 }));
    await post(claim({ depth: 2, loot: 100, pid: 'eeeeeeee5555', name: 'Fen' }));
    const one = (await (await get(`date=${DATE}&depth=1`)).json()) as { players: number };
    const two = (await (await get(`date=${DATE}&depth=2`)).json()) as { top: { n: string }[] };
    expect(one.players).toBe(1);
    expect(two.top.map((r) => r.n)).toEqual(['Fen']);
  });

  it('returns an empty board rather than an error for a night nobody has played', async () => {
    const b = (await (await get(`date=${DATE}&depth=7`)).json()) as { top: unknown[]; players: number };
    expect(b.top).toEqual([]);
    expect(b.players).toBe(0);
  });

  it('ignores a player id it does not like instead of refusing to answer', async () => {
    await field();
    const r = await get(`date=${DATE}&depth=1&pid=../../etc/passwd`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { me?: unknown }).me).toBeUndefined();
  });
});

describe('the door itself', () => {
  it('answers a health check', async () => {
    const b = (await (await fetch(`${base}/health`)).json()) as { ok: boolean; date: string };
    expect(b).toEqual({ ok: true, date: DATE });
  });

  it('has nothing else behind it', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/me`)).status).toBe(404);
    expect((await fetch(`${base}/board/../../etc/passwd`)).status).toBe(404);
  });

  it('lets a browser ask permission first', async () => {
    const r = await fetch(`${base}/board`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('stops one machine from writing all night', async () => {
    let refused = 0;
    for (let i = 0; i < 70; i++) if ((await post(claim({ loot: 100 + i }))).status === 429) refused++;
    expect(refused).toBeGreaterThan(0);
  });
});

describe('housekeeping', () => {
  it('drops nights nobody can submit to any more', async () => {
    await post(claim());
    expect(db.prune('2026-08-13')).toBe(1);
    const b = (await (await get(`date=${DATE}&depth=1`)).json()) as { players: number };
    expect(b.players).toBe(0);
  });
});
