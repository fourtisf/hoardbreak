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
import {
  CREW_CAP,
  CREW_KINDS,
  TUNING,
  UD,
  UPGRADE_COST_MUL,
  lvlOf,
  type CrewKind,
  type RunThief,
} from '@dragonjob/engine/headless';
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

/**
 * The three things the game says when the wyrm is up.
 *
 * They used to be written in three different places — the strip across the
 * canvas, the hint bar and the wake panel — and all three said "run", while the
 * wyrm's own box said "your crew can take it". A player told two opposite things
 * at once concludes the fight is simply not allowed, which is neither true nor
 * the design: the wyrm is a wall you eventually break, and the game has to say
 * which side of it you are standing on.
 *
 * One verdict in, three lines out, so they cannot drift apart again.
 */
export interface HuntLines {
  /** the strip across the top of the lair */
  strip: string;
  /** the coach line under the canvas */
  hint: string;
  /** the one-liner in the wake panel */
  wake: string;
  /** the second line of the banner the moment it opens its eyes */
  call: string;
}

export function huntLines(grade: Readiness['grade']): HuntLines {
  if (grade === 'ready') {
    return {
      strip: '⚔ IT HUNTS — and it can be killed. Get everyone onto it.',
      hint: '⚔ Your crew can kill it — put everyone on the wyrm and hold. Or take the gold and go.',
      wake: 'IT HUNTS. And it can be killed.',
      call: 'KILL IT.',
    };
  }
  if (grade === 'risky') {
    return {
      strip: '⚔ IT HUNTS — you could take it, or lose everyone trying.',
      hint: '⚔ Close either way — commit to the fight or run for the exit, but decide now',
      wake: 'IT HUNTS. This one could go either way.',
      call: 'FIGHT, OR RUN. NOW.',
    };
  }
  return {
    strip: '☠ IT HUNTS — get your crew to the exit and EXTRACT',
    hint: '☠ Not with this crew — get everyone onto the exit tiles and press E',
    wake: 'IT HUNTS. Get to the exit tiles.',
    call: 'RUN.',
  };
}

/* ================= the climb ================= */

/**
 * What it would actually take to kill the thing.
 *
 * "You cannot kill it yet" is true and useless on its own — it names a wall
 * without naming a door, and a player who reads it three runs running concludes
 * the fight is decorative. This prices the climb instead: the cheapest set of
 * recruits and upgrades that turns the verdict, and what it costs in gold.
 *
 * Greedy on damage-per-gold, which is roughly the order a player shopping by
 * feel would land on anyway. It is advice, not a purchase — nothing here spends
 * anything or touches the roster.
 */
export interface SlayerStep {
  /** a crew kind to recruit, or the Sharpened Steel upgrade */
  what: CrewKind | 'dmg';
  n: number;
  gold: number;
}

export interface SlayerPlan {
  steps: SlayerStep[];
  gold: number;
  /** false when the roster is capped and upgrades alone cannot close the gap */
  reachable: boolean;
  /** free damage still on the table: levels the current crew has not earned yet */
  levelsLeft: number;
  line: string;
}

/**
 * A copy deep enough for costing — never handed back to the caller.
 *
 * Everyone in it is at the level cap, because levels cost runs rather than gold
 * and a plan that ignores them quotes four times the real price. The caller is
 * told how many levels that assumes with `levelsLeft`.
 */
const forCosting = (meta: Meta): Meta => ({
  ...meta,
  crew: meta.crew.map((t) => ({ ...t, xp: TUNING.LEVEL_CAP })),
  up: { ...meta.up },
  upCost: { ...meta.upCost },
});

/**
 * How many exhales a body has to live through to be worth recruiting for this.
 *
 * The fight the plan is aiming at is about fourteen seconds and the breath comes
 * every 3.6, so three or four land. Ranked purely on damage per gold the plan
 * recruits Picklocks — the best value in the game, and 91 hp at the level cap
 * against an 85-damage exhale. Surviving the first breath by six points is not
 * surviving the fight, and a corpse deals no damage, so it is not a saving.
 */
const BREATHS_SURVIVED = 2;

const worthRecruiting = (k: CrewKind, up: Meta['up']): boolean => {
  const hp = UD[k].hp * (1 + TUNING.UP_HP_PER_LEVEL * up.hp) * (1 + TUNING.XP_STAT_PER_LEVEL * TUNING.LEVEL_CAP);
  // Emberkin are built for exactly this and take half of it
  const perBreath = TUNING.AWAKE_BREATH_DMG * (UD[k].fireRes ?? 1);
  return hp > perBreath * BREATHS_SURVIVED;
};

export function slayerPlan(meta: Meta, depth: number): SlayerPlan {
  const levelsLeft = meta.crew.reduce((n, t) => n + (TUNING.LEVEL_CAP - lvlOf(t)), 0);
  if (slayerReadiness(meta, depth).grade === 'ready') {
    return {
      steps: [],
      gold: 0,
      reachable: true,
      levelsLeft,
      line: 'Your crew is already enough. Go and take its head.',
    };
  }

  const m = forCosting(meta);
  const tally = new Map<CrewKind | 'dmg', { n: number; gold: number }>();
  let gold = 0;
  // bounded: nine bodies plus a realistic ceiling on Sharpened Steel
  for (let guard = 0; guard < 40; guard++) {
    if (slayerReadiness(m, depth).grade === 'ready') break;
    const before = crewDps(m);

    let best: { what: CrewKind | 'dmg'; cost: number; gain: number } | null = null;
    if (m.crew.length < CREW_CAP) {
      const hire = CREW_KINDS.filter((k) => worthRecruiting(k, m.up));
      for (const k of (hire.length ? hire : CREW_KINDS)) {
        const probe = forCosting(m);
        probe.crew.push({ tid: -1, name: '', kind: k, xp: TUNING.LEVEL_CAP });
        const gain = crewDps(probe) - before;
        const cost = UD[k].cost;
        if (gain > 0 && (!best || gain / cost > best.gain / best.cost)) best = { what: k, cost, gain };
      }
    }
    {
      const probe = forCosting(m);
      probe.up.dmg++;
      const gain = crewDps(probe) - before;
      const cost = m.upCost.dmg;
      if (gain > 0 && (!best || gain / cost > best.gain / best.cost)) best = { what: 'dmg', cost, gain };
    }
    if (!best) break;

    if (best.what === 'dmg') {
      m.up.dmg++;
      m.upCost.dmg = Math.ceil(m.upCost.dmg * UPGRADE_COST_MUL);
    } else {
      m.crew.push({ tid: -1, name: '', kind: best.what, xp: TUNING.LEVEL_CAP });
    }
    gold += best.cost;
    const row = tally.get(best.what) ?? { n: 0, gold: 0 };
    tally.set(best.what, { n: row.n + 1, gold: row.gold + best.cost });
  }

  const reachable = slayerReadiness(m, depth).grade === 'ready';
  const steps: SlayerStep[] = [...tally].map(([what, r]) => ({ what, n: r.n, gold: r.gold }));
  const name = (s: SlayerStep): string =>
    s.what === 'dmg' ? `Sharpened Steel ×${s.n}` : `${s.n}× ${UD[s.what].n}`;

  const line = !reachable
    ? 'Not at this depth, at any price. Clear a shallower lair first.'
    : `${steps.map(name).join(' + ')} — about ${gold}g — and the answer changes.` +
      (levelsLeft > 0 ? ` Assumes your crew is levelled: ${levelsLeft} levels still unearned.` : '');

  return { steps, gold, reachable, levelsLeft, line };
}
