/**
 * Lair generation — a pure function of (seed, depth, mod, meta).
 *
 * The server regenerates the same lair from `(date, depth)` to compute the
 * seed-bound loot ceiling (handoff §6 tier 2), so the draw order of `rngGen`
 * here is a wire contract. Do not reorder the random draws.
 */

import {
  ENTRANCE,
  GD,
  GUARD_POOL,
  HOARD_PILE,
  HOARD_ROOM,
  MID_ROOM_COUNT,
  NAMES,
  PRISONER_KINDS,
  T,
  TC,
  TR,
  TUNING,
  type GuardKind,
} from './defs.js';
import { carve, corridor, gi, revealAround } from './grid.js';
import type { Guard, PathNode, RunState, RunThief } from './types.js';

type RoomType = 'guardpost' | 'prison' | 'shrine' | 'armory';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const ctr = (r: Rect): PathNode => ({ x: ((r.x0 + r.x1) / 2) | 0, y: ((r.y0 + r.y1) / 2) | 0 });

/** Spawns a guard, scaled by depth and the daily modifier. */
export function spawnGuard(s: RunState, k: GuardKind, gx: number, gy: number, alerted = false): Guard {
  const d = GD[k];
  const hp = d.hp * (1 + TUNING.GUARD_HP_PER_DEPTH * (s.depth - 1)) * (s.mod.gHp || 1);
  const g: Guard = {
    k,
    x: gx * T + T / 2,
    y: gy * T + T / 2,
    px: gx * T + T / 2,
    py: gy * T + T / 2,
    hp,
    max: hp,
    alert: alerted,
    cd: 0,
    path: null,
    pi: 0,
    ptile: -1,
    face: 1,
    hex: 0,
    burn: 0,
    stun: 0,
    id: s.rngSim.range(0, 99),
  };
  s.guards.push(g);
  return g;
}

export function genLair(s: RunState): void {
  const rng = s.rngGen;
  const rri = (a: number, b: number): number => rng.int(a, b);
  const grid = s.grid;

  /* rooms ------------------------------------------------------------- */
  carve(grid, ENTRANCE.x0, ENTRANCE.y0, ENTRANCE.x1, ENTRANCE.y1);

  const mids: Rect[] = [];
  let tries = 0;
  while (mids.length < MID_ROOM_COUNT && tries < 80) {
    tries++;
    const w2 = rri(4, 6);
    const h2 = rri(3, 5);
    const x0 = rri(4, TC - 8);
    const y0 = rri(2, TR - 8);
    mids.push({ x0, y0, x1: x0 + w2, y1: y0 + h2 });
  }
  for (const r of mids) carve(grid, r.x0, r.y0, r.x1, r.y1);
  carve(grid, HOARD_ROOM.x0, HOARD_ROOM.y0, HOARD_ROOM.x1, HOARD_ROOM.y1);

  let prev = ctr(ENTRANCE);
  for (const r of [...mids, HOARD_ROOM]) {
    const c = ctr(r);
    corridor(grid, prev, c);
    prev = c;
  }

  /* exit --------------------------------------------------------------- */
  for (let y = ENTRANCE.y0; y <= ENTRANCE.y1; y++) {
    for (let x = ENTRANCE.x0; x <= ENTRANCE.x0 + 1; x++) s.exitTiles.push(gi(x, y));
  }
  s.exitCtr = { x: (ENTRANCE.x0 + 0.9) * T, y: ((ENTRANCE.y0 + ENTRANCE.y1) / 2 + 0.5) * T };

  /* room types --------------------------------------------------------- */
  const pool: RoomType[] = ['guardpost', 'guardpost', 'shrine', 'armory'];
  if (s.meta.lost.length || s.depth >= 2) pool[1] = 'prison';
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = pool[i] as RoomType;
    pool[i] = pool[j] as RoomType;
    pool[j] = a;
  }

  const mod = s.mod;
  const depth = s.depth;

  mids.forEach((r, idx) => {
    const type = pool[idx] as RoomType;
    const c = ctr(r);

    const gp = 1 + Math.floor(depth / 2) + rri(0, 1) + (mod.extraG && idx < 2 ? 1 : 0);
    for (let i = 0; i < gp; i++) {
      const kk: GuardKind = depth >= 3 && i === 0 ? 'warden' : (GUARD_POOL[rri(0, GUARD_POOL.length - 1)] as GuardKind);
      spawnGuard(s, kk, rri(r.x0, r.x1), rri(r.y0, r.y1));
    }

    const np = Math.round(rri(1, 3) * (mod.pileMul || 1));
    for (let i = 0; i < np; i++) {
      s.piles.push({
        x: rri(r.x0, r.x1) * T + T / 2,
        y: rri(r.y0, r.y1) * T + T / 2,
        amt: Math.round(rri(TUNING.PILE_MIN, TUNING.PILE_MAX) * (mod.pileMul || 1)),
      });
    }

    if (type === 'guardpost' && rng.next() < TUNING.CHEST_CHANCE) {
      s.chests.push({
        x: c.x * T + T / 2,
        y: c.y * T + T / 2,
        amt: Math.round(
          (TUNING.CHEST_BASE + TUNING.CHEST_PER_DEPTH * depth + rri(0, TUNING.CHEST_RAND)) * (mod.chestMul || 1),
        ),
        prog: 0,
        open: false,
      });
    }
    if (type === 'shrine') s.shrine = { x: c.x * T + T / 2, y: c.y * T + T / 2, prog: 0, done: false };
    if (type === 'armory') s.armory = { x: c.x * T + T / 2, y: c.y * T + T / 2, done: false };
    if (type === 'prison') {
      const fromQ = s.meta.lost.length > 0;
      let thief: RunThief;
      if (fromQ) {
        thief = s.meta.lost[0] as RunThief;
      } else {
        // The prototype minted the prisoner with `newThief()`, consuming a uid
        // even when nobody ever frees them. Keep that: the host advances
        // meta.uid with `freshPrisonerTid` so recruit naming stays in step.
        const tid = s.meta.uid + 1;
        thief = {
          tid,
          name: NAMES[(tid - 1) % NAMES.length] as string,
          kind: PRISONER_KINDS[rri(0, PRISONER_KINDS.length - 1)] as (typeof PRISONER_KINDS)[number],
          xp: 0,
        };
        s.freshPrisonerTid = tid;
      }
      s.prison = { x: c.x * T + T / 2, y: c.y * T + T / 2, prog: 0, done: false, fromQ, thief };
      spawnGuard(s, 'warden', c.x + 1, c.y);
    }
  });

  /* hoard + dragon ------------------------------------------------------ */
  const pool0 = Math.round((TUNING.HOARD_BASE + TUNING.HOARD_PER_DEPTH * depth) * (mod.hoardMul || 1));
  s.hoard = { x0: HOARD_PILE.x0, y0: HOARD_PILE.y0, x1: HOARD_PILE.x1, y1: HOARD_PILE.y1, pool: pool0, pool0 };

  spawnGuard(s, 'warden', 25, 4);
  if (depth >= 2) spawnGuard(s, depth >= 4 ? 'high' : 'sentinel', 25, 7);

  const dhp = TUNING.DRAGON_HP_BASE + TUNING.DRAGON_HP_PER_DEPTH * depth;
  s.dragon = {
    x: 27.2 * T,
    y: 5.3 * T,
    px: 27.2 * T,
    py: 5.3 * T,
    hp: dhp,
    max: dhp,
    awake: false,
    cd: TUNING.AWAKE_BREATH_CD,
    scd: 6,
    stunT: 0,
  };

  revealAround(s.revealed, 4 * T, 17 * T, s.mod.rev || TUNING.REVEAL_R_START);
}

/**
 * The seed-bound loot ceiling for a lair (handoff §6, validation tier 2).
 * Lives next to the generator so the two can never drift apart.
 */
export function maxLootFor(s: RunState): number {
  const piles = s.piles.reduce((a, p) => a + p.amt, 0);
  const chests = s.chests.reduce((a, c) => a + c.amt, 0);
  // +2 for the reinforcements that stage 2 spawns at 75% wake — they carry
  // bounties too, so the ceiling has to allow for them.
  const bounties = (s.guards.length + 2) * TUNING.GUARD_BOUNTY;
  // Greedy Gauntlets only lift piles and the siphoned hoard.
  const greedy = (piles + s.hoard.pool0) * TUNING.GREED_MUL;
  return Math.ceil(greedy + chests + bounties + TUNING.SLAY_BONUS + TUNING.SHRINE_OVERFLOW);
}
