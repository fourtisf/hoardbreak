/**
 * What the server is allowed to believe.
 *
 * The client computes its own run, so a submitted score is a claim, not a fact.
 * This is the tier-2 check the handoff describes (§6): the lair is a pure
 * function of `date:depth`, so the server can generate the same one and ask the
 * only question that has a hard answer — is this more gold than that lair
 * contains?
 *
 * It is deliberately not called anti-cheat. It cannot tell a good run from a
 * patient one, and someone who reads the client can submit the ceiling exactly.
 * What it does stop is the entire top of the board being `999999999`, which is
 * what an unchecked endpoint gets within a day. Replay verification (Phase 4,
 * the input log the engine already records) is the real answer and needs the
 * run log shipped with the score.
 */
import { createRun, dailySeed, maxLootFor, modFor, type RunMeta } from '@dragonjob/engine/headless';

/**
 * The roster used for generation.
 *
 * Lair generation reads `meta.depth` and the lost queue (a prison is only
 * populated from it), and nothing else — so an empty crew generates the same
 * rooms, guards, piles and chests as a full one. `maxLootFor` then sums what is
 * actually in there, plus the reinforcements stage 2 spawns.
 */
const bareMeta = (depth: number): RunMeta => ({
  depth,
  uid: 0,
  crew: [],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

/**
 * Generating a lair costs a few milliseconds, and every submission for a given
 * night asks the same question. There are at most a couple of dozen live
 * (date, depth) pairs at a time, so this is bounded by the calendar.
 */
const ceilings = new Map<string, number>();

export function lootCeiling(date: string, depth: number): number {
  const key = `${date}:${depth}`;
  const hit = ceilings.get(key);
  if (hit !== undefined) return hit;

  const run = createRun({
    seed: dailySeed(date, depth),
    depth,
    mod: modFor(date, depth),
    meta: bareMeta(depth),
    date,
  });
  const ceiling = maxLootFor(run);
  ceilings.set(key, ceiling);
  return ceiling;
}

/** Drop cached ceilings for nights nobody can submit to any more. */
export function forgetCeilingsBefore(date: string): void {
  for (const key of ceilings.keys()) if ((key.split(':')[0] as string) < date) ceilings.delete(key);
}

export interface Claim {
  date: string;
  depth: number;
  loot: number;
}

export type Refusal = { ok: false; why: string } | { ok: true };

/**
 * `today` is passed in rather than read from the clock so the caller — and the
 * tests — decide what "now" is.
 */
export function judge(c: Claim, today: string): Refusal {
  // one day either side: a run started before UTC midnight lands after it, and
  // a player whose clock is a few hours out is a player, not an attacker
  const day = 86400000;
  const t = Date.parse(`${today}T00:00:00Z`);
  const d = Date.parse(`${c.date}T00:00:00Z`);
  if (!Number.isFinite(d)) return { ok: false, why: 'bad date' };
  if (Math.abs(d - t) > day) return { ok: false, why: 'that night is closed' };

  if (!Number.isInteger(c.depth) || c.depth < 1 || c.depth > 99) return { ok: false, why: 'bad depth' };
  if (!Number.isInteger(c.loot) || c.loot < 0) return { ok: false, why: 'bad loot' };

  const ceiling = lootCeiling(c.date, c.depth);
  if (c.loot > ceiling) return { ok: false, why: `that lair holds ${ceiling}` };
  return { ok: true };
}
