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

export function boardRows(date: string, todayBest: number): BoardRow[] {
  const rng = mulberry32(hashStr(`${date}:board`));
  const rows: BoardRow[] = RIVALS.map((n) => ({ n, s: Math.round(600 + rng() * 3400) }));
  rows.push({ n: 'you', s: todayBest, you: true });
  rows.sort((a, b) => b.s - a.s);
  return rows;
}
