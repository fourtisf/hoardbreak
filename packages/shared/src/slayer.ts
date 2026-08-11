/**
 * Can this crew actually kill the wyrm?
 *
 * The game's own balance test proves the answer swings from "no, and it costs
 * you everyone" to "yes, comfortably" purely on roster size and levels. Players
 * were left to discover that by losing four named thieves with no explanation,
 * so the answer now gets computed and shown — in the hideout before they go in,
 * and in the raid the moment the thing opens its eyes.
 *
 * The damage maths mirrors `unitDmgMul` in sim.ts. If that formula changes and
 * this does not, `slayer.test.ts` fails.
 */
import { TUNING, UD, lvlOf, type CrewKind, type RunThief } from '@dragonjob/engine/headless';
import type { Meta } from './meta.js';

/** What the wyrm is worth in health at a given depth. */
export const dragonHpAt = (depth: number): number =>
  TUNING.DRAGON_HP_BASE + TUNING.DRAGON_HP_PER_DEPTH * depth;

/** One thief's sustained damage, levels and bought gear included. */
export function thiefDps(t: RunThief, up: Meta['up']): number {
  const base = UD[t.kind as CrewKind].dps;
  return base * (1 + TUNING.UP_DMG_PER_LEVEL * up.dmg) * (1 + TUNING.XP_STAT_PER_LEVEL * lvlOf(t));
}

/** The whole roster's damage per second, if every one of them is in reach. */
export const crewDps = (meta: Meta): number =>
  meta.crew.reduce((n, t) => n + thiefDps(t, meta.up), 0);

/** How many of them a single exhale would kill outright. */
export const glassCount = (meta: Meta): number =>
  meta.crew.filter(
    (t) => UD[t.kind as CrewKind].hp * (1 + TUNING.UP_HP_PER_LEVEL * meta.up.hp) <= TUNING.AWAKE_BREATH_DMG,
  ).length;

export interface Readiness {
  /** seconds of uninterrupted contact needed to drop it */
  ttk: number;
  dps: number;
  dragonHp: number;
  /** crew who die to one breath */
  glass: number;
  /**
   * The honest verdict.
   *
   * `flee` is not "you are bad at this" — it is the game's premise. Most runs,
   * at most depths, should read `flee`, and the copy says so without scolding.
   */
  grade: 'flee' | 'risky' | 'ready';
  /** one line a player can act on */
  line: string;
}

/**
 * A crew is called ready only if it can finish inside the window it survives.
 *
 * The measured fight is roughly 12 s for nine levelled bodies and 15 s for four
 * fresh ones before the breath has cleared them out, so 14 s is the honest line
 * between "you might" and "you will not" — with `risky` covering the middle
 * where it comes down to whether anyone eats a breath.
 */
export function slayerReadiness(meta: Meta, depth: number): Readiness {
  const dps = crewDps(meta);
  const dragonHp = dragonHpAt(depth);
  const ttk = dps > 0 ? dragonHp / dps : Infinity;
  const glass = glassCount(meta);

  const grade: Readiness['grade'] = ttk <= 14 ? 'ready' : ttk <= 26 ? 'risky' : 'flee';
  const need = Math.max(1, Math.ceil((dragonHp / 14 / Math.max(dps, 1)) * 10) / 10);

  const line =
    grade === 'ready'
      ? `Your crew can take it — about ${Math.ceil(ttk)}s of contact.`
      : grade === 'risky'
        ? `A close thing: ~${Math.ceil(ttk)}s of contact, and ${glass} of you die to one breath. Bring more bodies.`
        : `You cannot kill it yet. You would need about ${need}× the damage — more crew, higher levels, Sharpened Steel.`;

  return { ttk, dps, dragonHp, glass, grade, line };
}
