/**
 * Daily board.
 *
 * Phase 1 has no backend, so this is the prototype's local stand-in: four
 * seeded rivals plus you. Phase 2 replaces `boardRows` with the Redis ZSET
 * `lb:{date}` served by `GET /daily` (handoff §8) — the row shape below is
 * already what that endpoint will return.
 */

import { hashStr, mulberry32 } from '@hoardbreak/engine/headless';

export interface BoardRow {
  /** wallet or handle */
  n: string;
  /** best single heist today, gold */
  s: number;
  you?: boolean;
}

const RIVALS = ['0xR4T…', 'wickmaxi', 'sable.sol', 'GrimGoldman'];

/**
 * One board per depth (v0.3).
 *
 * A single global "biggest heist" board is really a "who is deepest" board —
 * the hoard alone scales 800 + 420 × depth, so a depth-9 run beats a perfect
 * depth-2 run without being played better. Ranking within a depth is what makes
 * "the same lair for everyone" mean something.
 *
 * Phase 2 keys the Redis ZSET `lb:{date}:{depth}` instead of `lb:{date}`
 * (an amendment to handoff §8 — flagged in the README).
 */
export function boardRows(date: string, depth: number, myBest: number): BoardRow[] {
  const rng = mulberry32(hashStr(`${date}:board:${depth}`));
  const scale = 1 + 0.38 * (depth - 1);
  const rows: BoardRow[] = RIVALS.map((n) => ({ n, s: Math.round((600 + rng() * 3400) * scale) }));
  rows.push({ n: 'you', s: myBest, you: true });
  rows.sort((a, b) => b.s - a.s);
  return rows;
}
