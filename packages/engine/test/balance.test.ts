/**
 * The wyrm's price.
 *
 * "Rob the dragon. Don't wake it." only means something if waking it is a
 * catastrophe you cannot punch your way out of on day one — and only stays
 * interesting if a fully-built crew eventually can. Those are design decisions,
 * not accidents of arithmetic, so they are pinned here: change DRAGON_HP_BASE,
 * a class's dps, or the breath and this file tells you which promise you broke.
 */
import { describe, expect, it } from 'vitest';
import {
  MODS,
  TUNING,
  UD,
  createRun,
  dailySeed,
  step,
  type InputFrame,
  type RunMeta,
  type RunState,
} from '../src/headless.js';

const IDLE: InputFrame = { ax: 0, ay: 0, click: null, commands: [] };

const meta = (depth: number, crew: RunMeta['crew'], up: RunMeta['up']): RunMeta => ({
  depth,
  uid: 9,
  crew,
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up,
});

/** What every player starts with. */
const START: RunMeta['crew'] = [
  { tid: 1, name: 'Rats', kind: 'picklock', xp: 0 },
  { tid: 2, name: 'Wick', kind: 'picklock', xp: 0 },
  { tid: 3, name: 'Sable', kind: 'hexer', xp: 0 },
  { tid: 4, name: 'Fen', kind: 'bruiser', xp: 0 },
];

/** A roster nobody assembles by accident: nine, levelled, built to brawl. */
const ENDGAME: RunMeta['crew'] = [
  { tid: 1, name: 'A', kind: 'bruiser', xp: 9999 },
  { tid: 2, name: 'B', kind: 'bruiser', xp: 9999 },
  { tid: 3, name: 'C', kind: 'golem', xp: 9999 },
  { tid: 4, name: 'D', kind: 'golem', xp: 9999 },
  { tid: 5, name: 'E', kind: 'emberkin', xp: 9999 },
  { tid: 6, name: 'F', kind: 'emberkin', xp: 9999 },
  { tid: 7, name: 'G', kind: 'emberkin', xp: 9999 },
  { tid: 8, name: 'H', kind: 'hexer', xp: 9999 },
  { tid: 9, name: 'I', kind: 'hexer', xp: 9999 },
];

interface Duel {
  dealtPct: number;
  slain: boolean;
  seconds: number;
  survivors: number;
}

/**
 * Wake it, glue the crew onto it, and let it run.
 *
 * Teleporting the crew onto the dragon every tick is deliberately the most
 * favourable fight a player could ever engineer — no travel, no missed swings,
 * every class in range at once. A crew that loses *this* cannot win the real
 * one, so the "cannot" assertions below hold with room to spare.
 */
function duel(depth: number, crew: RunMeta['crew'], up: RunMeta['up']): Duel {
  const date = '2026-08-11';
  const s: RunState = createRun({
    seed: dailySeed(date, depth),
    depth,
    mod: MODS[0]!,
    meta: meta(depth, crew, up),
    date,
  });
  s.wake = 100;
  step(s, IDLE);
  s.guards.length = 0; // isolate the duel from the 75% reinforcements
  const hp0 = s.dragon.hp;

  let t = 0;
  while (t < 180 && !s.over && !s.slain && s.units.length) {
    for (const u of s.units) {
      u.x = s.dragon.x;
      u.y = s.dragon.y;
    }
    step(s, IDLE);
    t += 1 / 60;
  }
  return {
    dealtPct: ((hp0 - s.dragon.hp) / hp0) * 100,
    slain: s.slain,
    seconds: t,
    survivors: s.units.length,
  };
}

const NO_GEAR = { dmg: 0, hp: 0, inc: 0 };
const MAX_GEAR = { dmg: 12, hp: 12, inc: 0 };

describe('the wyrm is not a boss you may fight on day one', () => {
  it('wipes a starting crew without dropping a quarter of its health', () => {
    const r = duel(1, START, NO_GEAR);
    expect(r.slain).toBe(false);
    expect(r.survivors).toBe(0);
    expect(r.dealtPct).toBeLessThan(25);
    expect(r.seconds).toBeLessThan(30); // and it is over fast enough to read as a mistake
  });

  it('one breath outright kills the two classes a new player starts with most of', () => {
    // 2 Picklocks and a Hexer out of 4 — three quarters of the starting crew
    // die to a single exhale, which is why running is the only opening move
    expect(UD.picklock.hp).toBeLessThan(TUNING.AWAKE_BREATH_DMG);
    expect(UD.hexer.hp).toBeLessThan(TUNING.AWAKE_BREATH_DMG);
    expect(START.filter((c) => UD[c.kind].hp < TUNING.AWAKE_BREATH_DMG).length).toBe(3);
  });

  it('flies faster than the heaviest crew can walk, so weight cannot simply run', () => {
    expect(TUNING.DRAGON_SPD).toBeGreaterThan(UD.golem.spd);
    expect(UD.picklock.spd).toBeGreaterThan(TUNING.DRAGON_SPD); // but the light ones outpace it
  });
});

describe('…and is a real trophy once the hideout is built out', () => {
  it('falls to a full levelled roster even with no gear bought', () => {
    const r = duel(1, ENDGAME, NO_GEAR);
    expect(r.slain).toBe(true);
    expect(r.survivors).toBeGreaterThan(0);
  });

  it('still falls at depth 8, where it has the most health it will ever have', () => {
    const r = duel(8, ENDGAME, MAX_GEAR);
    expect(r.slain).toBe(true);
    expect(r.seconds).toBeLessThan(30);
  });
});
