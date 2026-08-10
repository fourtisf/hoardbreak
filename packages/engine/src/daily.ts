/**
 * Daily seeding.
 *
 * Phase 1 computes the seed on the client exactly the way the prototype did
 * (`hashStr(date + ':' + depth)`). Phase 2 replaces `dailySeed` with a
 * server-issued HMAC seed (handoff §5) — everything downstream already takes
 * the seed as a plain uint32, so nothing else has to change.
 */

import { MODS, type ModDef } from './defs.js';
import { hashStr, mulberry32 } from './rng.js';

/** Today's date in UTC, `YYYY-MM-DD`. Day rolls over at UTC midnight (§5). */
export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Phase 1 lair seed. Phase 2: `HMAC_SHA256(SEED_SECRET, "date:depth")[0..8]`. */
export function dailySeed(date: string, depth: number): number {
  return hashStr(`${date}:${depth}`);
}

/**
 * The lair modifier for a given day and depth. Deterministic and public —
 * `GET /daily` will preview these server-side without handing out seeds.
 */
export function modFor(date: string, depth: number): ModDef {
  const rng = mulberry32(hashStr(`${date}:mod:${depth}`));
  return MODS[Math.floor(rng() * MODS.length)] as ModDef;
}

/**
 * Derives the combat/fx stream seed from the run seed, so a single server
 * seed pins both streams and a replay reproduces the run exactly (§4).
 */
export function simSeedFrom(seed: number): number {
  return hashStr(`sim:${seed >>> 0}`);
}
