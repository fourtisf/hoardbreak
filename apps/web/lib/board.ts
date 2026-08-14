/**
 * Talking to the daily board.
 *
 * Two rules, both about failure:
 *
 *  1. **The game never waits on it.** Every call is on a short timeout and
 *     every call can fail. A player mid-heist on a train should not notice the
 *     board is unreachable, and a run's payout is applied locally regardless of
 *     whether anyone else ever sees the score.
 *  2. **A board that cannot be reached says so.** The old local stand-in
 *     invented four rivals with plausible scores, which is worse than an empty
 *     board — it told players they were competing when they were not. When the
 *     server is silent the screen says the night is not reachable, and offers
 *     the retry.
 */
import type { BoardRow } from '@dragonjob/shared';

/** Same origin by default: nginx proxies `/api` to the board service. */
const API = process.env.NEXT_PUBLIC_API ?? '/api';
const TIMEOUT = 6000;

export interface Rival {
  n: string;
  s: number;
  gap: number;
}

export interface Standing {
  date: string;
  depth: number;
  top: BoardRow[];
  me?: BoardRow;
  rank?: number;
  /** the next name up the board — someone to chase */
  rival?: Rival;
  players: number;
}

export interface Intel {
  date: string;
  depth: number;
  players: number;
  avgLoot: number;
  bestLoot: number;
  verdicts: Record<string, number>;
}

export type IntelState =
  | { k: 'loading' }
  | { k: 'ok'; intel: Intel }
  | { k: 'empty' }
  | { k: 'down' };

export type BoardState =
  | { k: 'loading' }
  | { k: 'ok'; standing: Standing }
  /** the board exists, this night is simply empty so far */
  | { k: 'empty'; standing: Standing }
  | { k: 'down'; why: string };

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const ctl = new AbortController();
  const bell = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(bell);
  }
}

export async function fetchBoard(date: string, depth: number, pid: string): Promise<BoardState> {
  try {
    const s = (await call(`/board?date=${encodeURIComponent(date)}&depth=${depth}&pid=${encodeURIComponent(pid)}`)) as Standing;
    return { k: s.players > 0 ? 'ok' : 'empty', standing: s };
  } catch (e) {
    return { k: 'down', why: e instanceof Error ? e.message : 'unreachable' };
  }
}

/** The whisper network — what tonight's raiders did at this depth. Optional like the board. */
export async function fetchIntel(date: string, depth: number): Promise<IntelState> {
  try {
    const i = (await call(`/intel?date=${encodeURIComponent(date)}&depth=${depth}`)) as Intel;
    return i.players > 0 ? { k: 'ok', intel: i } : { k: 'empty' };
  } catch {
    return { k: 'down' };
  }
}

export interface Submission {
  pid: string;
  name: string;
  date: string;
  depth: number;
  loot: number;
  verdict: string;
}

/**
 * Post a finished run.
 *
 * Deliberately returns a verdict rather than throwing: a refused or unreachable
 * board is worth telling the player about once, quietly, and is never worth
 * interrupting the end-of-run card for.
 */
export async function postRun(s: Submission): Promise<{ ok: boolean; rank?: number; why?: string }> {
  // a run worth nothing is not worth a row, and the server would take it
  if (!s.name.trim() || s.loot <= 0) return { ok: false, why: 'nothing to post' };
  try {
    const r = (await call('/board', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    })) as { rank?: number };
    return { ok: true, rank: r.rank };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : 'unreachable' };
  }
}
