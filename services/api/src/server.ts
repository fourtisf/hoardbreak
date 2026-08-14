/**
 * THE DRAGON JOB — the daily board.
 *
 * The one thing a shared daily genuinely needs a server for. Everything else
 * (the hideout, the crew, the gold) stays on the player's machine where it
 * already is; this service knows nothing about any of it and cannot be asked
 * to. It stores one number per player per night per depth.
 *
 * No framework and no runtime dependencies: `node:http` and `node:sqlite` both
 * ship with Node 22, and for two endpoints that is the whole job. Anything
 * exposed to the internet is worth keeping small enough to read in one sitting.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { cleanName } from '@dragonjob/shared';
import { openDb, type Db } from './db.js';
import { forgetCeilingsBefore, judge } from './verify.js';

const PORT = Number(process.env.PORT ?? 3100);
const DB_FILE = process.env.DJ_DB ?? '/var/lib/dragonjob/board.db';
/** how many nights to keep; the board is a daily, not an archive */
const KEEP_DAYS = 30;
/** requests per minute per address, submissions and reads counted together */
const RATE = 60;
const BODY_MAX = 4096;

export const todayUTC = (at = Date.now()): string => new Date(at).toISOString().slice(0, 10);
const daysBefore = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/* ---------------- plumbing ---------------- */

/**
 * A fixed window per address.
 *
 * Crude on purpose: the thing worth stopping is one machine writing a million
 * rows, and precision would cost more than it is worth. Behind nginx the real
 * address arrives in `x-forwarded-for`, so it is read first — this service is
 * never exposed directly.
 */
class Limiter {
  private hits = new Map<string, { n: number; until: number }>();
  ok(who: string, now = Date.now()): boolean {
    const cur = this.hits.get(who);
    if (!cur || now > cur.until) {
      this.hits.set(who, { n: 1, until: now + 60000 });
      // the map is swept rather than kept: an address that stopped calling
      // should not hold memory until the process restarts
      if (this.hits.size > 5000) for (const [k, v] of this.hits) if (now > v.until) this.hits.delete(k);
      return true;
    }
    cur.n++;
    return cur.n <= RATE;
  }
}

const send = (res: ServerResponse, code: number, body: unknown): void => {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(text);
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let n = 0;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      n += c.length;
      // stop reading rather than buffer whatever someone decides to send
      if (n > BODY_MAX) {
        reject(new Error('too big'));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });

/** A player id is a handle for "your row", not a credential. Shape-checked only. */
const PID = /^[a-z0-9]{8,40}$/;

/* ---------------- routes ---------------- */

export function createApi(db: Db, now: () => number = Date.now) {
  const limiter = new Limiter();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const who = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() || req.socket.remoteAddress || '?';
    const url = new URL(req.url ?? '/', 'http://board');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (!limiter.ok(who, now())) return send(res, 429, { error: 'slow down' });

    if (path === '/health') return send(res, 200, { ok: true, date: todayUTC(now()) });

    if (path === '/board' && req.method === 'GET') {
      const date = url.searchParams.get('date') ?? todayUTC(now());
      const depth = Number(url.searchParams.get('depth') ?? '1');
      const pid = url.searchParams.get('pid');
      if (!Number.isInteger(depth) || depth < 1 || depth > 99) return send(res, 400, { error: 'bad depth' });
      const standing = db.standing(date, depth, pid && PID.test(pid) ? pid : null);
      return send(res, 200, { date, depth, ...standing });
    }

    if (path === '/intel' && req.method === 'GET') {
      const date = url.searchParams.get('date') ?? todayUTC(now());
      const depth = Number(url.searchParams.get('depth') ?? '1');
      if (!Number.isInteger(depth) || depth < 1 || depth > 99) return send(res, 400, { error: 'bad depth' });
      return send(res, 200, db.intel(date, depth));
    }

    if (path === '/board' && req.method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'bad body' });
      }
      const b = body as Record<string, unknown>;
      // read the numbers strictly rather than coercing: `JSON.stringify(NaN)`
      // is `null`, and `Number(null)` is 0 — so a malformed score would arrive
      // as a perfectly valid zero-gold run instead of being refused
      const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);
      const pid = typeof b.pid === 'string' ? b.pid : '';
      const date = typeof b.date === 'string' ? b.date : '';
      const depth = num(b.depth);
      const loot = num(b.loot);
      const verdict = typeof b.verdict === 'string' ? b.verdict.slice(0, 16) : '';
      const name = cleanName(typeof b.name === 'string' ? b.name : '');

      if (!PID.test(pid)) return send(res, 400, { error: 'bad pid' });
      if (!name) return send(res, 400, { error: 'a run needs a name on it' });

      const verdictOfClaim = judge({ date, depth, loot }, todayUTC(now()));
      if (!verdictOfClaim.ok) return send(res, 400, { error: verdictOfClaim.why });

      const changed = db.submit({ date, depth, pid, name, loot, verdict, at: now() });
      const standing = db.standing(date, depth, pid);
      return send(res, 200, { date, depth, changed, ...standing });
    }

    return send(res, 404, { error: 'no such door' });
  };
}

/* ---------------- boot ---------------- */

/** Only when run directly — importing this module for tests must not listen. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb(DB_FILE);
  const sweep = (): void => {
    const cutoff = daysBefore(todayUTC(), KEEP_DAYS);
    const gone = db.prune(cutoff);
    forgetCeilingsBefore(cutoff);
    if (gone) console.log(`[board] pruned ${gone} rows older than ${cutoff}`);
  };
  sweep();
  setInterval(sweep, 6 * 3600_000).unref();

  createServer(createApi(db)).listen(PORT, '127.0.0.1', () => {
    console.log(`[board] listening on 127.0.0.1:${PORT} · db ${DB_FILE}`);
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      db.close();
      process.exit(0);
    });
  }
}
