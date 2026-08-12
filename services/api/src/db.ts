/**
 * The board, on disk.
 *
 * `node:sqlite` ships with Node 22, so this service has no runtime
 * dependencies at all — nothing to audit, nothing to keep patched, and nothing
 * to install on the box beyond what already runs the site. For a table that
 * holds one row per player per night per depth, a single file is the right
 * amount of database.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Row {
  n: string;
  s: number;
  you?: boolean;
}

export interface Standing {
  top: Row[];
  me?: Row;
  /** 1-based, only when this player has a score tonight */
  rank?: number;
  players: number;
}

export interface Score {
  date: string;
  depth: number;
  pid: string;
  name: string;
  loot: number;
  verdict: string;
  at: number;
}

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // durability over raw speed: a board that loses last night to a power cut is
  // worse than one that writes a few milliseconds slower
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      date    TEXT    NOT NULL,
      depth   INTEGER NOT NULL,
      pid     TEXT    NOT NULL,
      name    TEXT    NOT NULL,
      loot    INTEGER NOT NULL,
      verdict TEXT    NOT NULL,
      at      INTEGER NOT NULL,
      PRIMARY KEY (date, depth, pid)
    ) WITHOUT ROWID;
  `);
  db.exec('CREATE INDEX IF NOT EXISTS scores_board ON scores(date, depth, loot DESC, at ASC)');
  return new Db(db);
}

export class Db {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Record a score, keeping only the player's best for that night and depth.
   *
   * Their *best* rather than their latest: the board asks "what is the biggest
   * heist tonight", and a player whose second run went badly has not stopped
   * having made the first one. Returns true when the board actually changed.
   */
  submit(s: Score): boolean {
    const prev = this.db
      .prepare('SELECT loot FROM scores WHERE date = ? AND depth = ? AND pid = ?')
      .get(s.date, s.depth, s.pid) as { loot: number } | undefined;
    if (prev && prev.loot >= s.loot) {
      // the name can still change — someone renamed themselves between runs
      this.db
        .prepare('UPDATE scores SET name = ? WHERE date = ? AND depth = ? AND pid = ?')
        .run(s.name, s.date, s.depth, s.pid);
      return false;
    }
    this.db
      .prepare(
        `INSERT INTO scores (date, depth, pid, name, loot, verdict, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date, depth, pid) DO UPDATE SET
           name = excluded.name, loot = excluded.loot,
           verdict = excluded.verdict, at = excluded.at`,
      )
      .run(s.date, s.depth, s.pid, s.name, s.loot, s.verdict, s.at);
    return true;
  }

  /** The top of the board, plus where this player stands on it. */
  standing(date: string, depth: number, pid: string | null, limit = 10): Standing {
    const top = this.db
      .prepare(
        `SELECT name AS n, loot AS s, pid FROM scores
         WHERE date = ? AND depth = ?
         ORDER BY loot DESC, at ASC LIMIT ?`,
      )
      .all(date, depth, limit) as { n: string; s: number; pid: string }[];

    const players = (
      this.db.prepare('SELECT COUNT(*) AS c FROM scores WHERE date = ? AND depth = ?').get(date, depth) as {
        c: number;
      }
    ).c;

    const out: Standing = {
      top: top.map((r) => (pid && r.pid === pid ? { n: r.n, s: r.s, you: true } : { n: r.n, s: r.s })),
      players,
    };
    if (!pid) return out;

    const mine = this.db
      .prepare('SELECT name AS n, loot AS s, at FROM scores WHERE date = ? AND depth = ? AND pid = ?')
      .get(date, depth, pid) as { n: string; s: number; at: number } | undefined;
    if (!mine) return out;

    // ties break on who got there first, exactly as the ordering above does
    const ahead = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM scores
           WHERE date = ? AND depth = ? AND (loot > ? OR (loot = ? AND at < ?))`,
        )
        .get(date, depth, mine.s, mine.s, mine.at) as { c: number }
    ).c;
    out.me = { n: mine.n, s: mine.s, you: true };
    out.rank = ahead + 1;
    return out;
  }

  /** Nights nobody can submit to any more are not worth keeping for ever. */
  prune(before: string): number {
    const r = this.db.prepare('DELETE FROM scores WHERE date < ?').run(before);
    return Number(r.changes);
  }

  close(): void {
    this.db.close();
  }
}
