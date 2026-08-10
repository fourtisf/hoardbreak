/**
 * Seeded PRNG — ported verbatim from the prototype (`hashStr` + `mulberry32`).
 *
 * Determinism is the anti-cheat backbone (handoff §5): the server regenerates
 * any lair from (date, depth) to validate a submitted run, so these two
 * functions must stay bit-identical between client and server forever.
 */

/** 32-bit string hash. Returns a uint32. */
export function hashStr(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough, and trivially portable. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** raw float in [0, 1) */
  next(): number;
  /** float in [a, b) — the prototype's `rnd`/`rr` */
  range(a: number, b: number): number;
  /** integer in [a, b] inclusive — the prototype's `ri`/`rri` */
  int(a: number, b: number): number;
  /** uniform pick from a non-empty array */
  pick<T>(arr: readonly T[]): T;
  /** how many values have been drawn — handy for asserting call-order parity */
  readonly draws: number;
}

/**
 * A named RNG stream. A run has two of them (handoff §4):
 *   - `rngGen` drives lair layout and must match the server exactly
 *   - `rngSim` drives combat jitter and fx
 */
export function createRng(seed: number): Rng {
  const raw = mulberry32(seed >>> 0);
  let draws = 0;
  const next = (): number => {
    draws++;
    return raw();
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b + 1 - a)),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
    get draws() {
      return draws;
    },
  };
}
