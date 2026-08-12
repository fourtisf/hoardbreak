/**
 * What changes as you go down.
 *
 * Depth was a difficulty slider: more guard health, more gold, more dragon, and
 * nothing at depth six that was not already at depth one. These pin the three
 * rules that now arrive with depth — and, just as importantly, that they change
 * nothing about the lair itself. Generation parity with the prototype is the
 * one thing in this engine that is not allowed to move.
 */
import { describe, expect, it } from 'vitest';
import {
  GARRISON_DEPTH,
  LIGHT_SLEEPER_DEPTH,
  MODS,
  TIGHT_DOOR_DEPTH,
  TIGHT_SEAL_AT,
  TUNING,
  createRun,
  dailySeed,
  depthRules,
  snapshot,
  step,
  type InputFrame,
  type RunMeta,
  type RunState,
} from '../src/headless.js';

const IDLE: InputFrame = { mx: 0, my: 0, mm: 0, commands: [] };
const DATE = '2026-08-11';

const meta = (depth: number): RunMeta => ({
  depth,
  uid: 2,
  crew: [{ tid: 1, name: 'Rats', kind: 'bruiser', xp: 0 }],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

const mk = (depth: number): RunState =>
  createRun({ seed: dailySeed(DATE, depth), depth, mod: MODS[4]!, meta: meta(depth), date: DATE });

describe('the lair itself never moves', () => {
  it('generates byte-identically whatever the depth rules say', () => {
    // the rules alert guards and set a meter; neither is a roll, so the rooms,
    // the guard kinds and their positions are untouched. If this ever fails,
    // a rule has started consuming the generation stream and every player's
    // lair has quietly diverged from every other player's.
    for (const depth of [1, 3, 5, 7, 9]) {
      const a = snapshot(mk(depth));
      const b = snapshot(mk(depth));
      expect(b).toEqual(a);
    }
  });
});

describe('depth 3 · the garrison is expecting you', () => {
  it('leaves the shallow lairs asleep', () => {
    for (const depth of [1, 2]) {
      expect(depthRules(depth).awakeGuards).toBe(0);
      expect(mk(depth).guards.some((g) => g.alert)).toBe(false);
    }
  });

  it('starts two guards hunting from here down', () => {
    const s = mk(GARRISON_DEPTH);
    expect(s.guards.filter((g) => g.alert)).toHaveLength(2);
  });

  it('puts them between you and the way out, not at the far end', () => {
    const s = mk(GARRISON_DEPTH);
    const far = (g: { x: number; y: number }): number => Math.hypot(g.x - s.exitCtr.x, g.y - s.exitCtr.y);
    const awake = s.guards.filter((g) => g.alert).map(far);
    const asleep = s.guards.filter((g) => !g.alert).map(far);
    expect(Math.max(...awake)).toBeLessThanOrEqual(Math.min(...asleep));
  });
});

describe('depth 5 · it sleeps lightly', () => {
  it('starts the shallow lairs at nothing, as they always did', () => {
    for (const depth of [1, 4]) expect(mk(depth).wake).toBe(0);
  });

  it('starts the meter where one eye opens', () => {
    const s = mk(LIGHT_SLEEPER_DEPTH);
    expect(s.wake).toBe(TUNING.STAGE1_WAKE);
  });

  it('says so on the meter rather than lying about it', () => {
    // the stage has to match the number on screen, or the HUD reads 50% while
    // the wyrm behaves as though it were asleep
    expect(mk(LIGHT_SLEEPER_DEPTH).stage).toBe(1);
  });

  it('breathes in its sleep from the first seconds, not after a minute', () => {
    const s = mk(LIGHT_SLEEPER_DEPTH);
    s.guards.length = 0;
    let breathed = false;
    for (let i = 0; i < 60 * 12 && !breathed; i++) {
      step(s, IDLE);
      if (s.timers.some((t) => t.k === 'blast')) breathed = true;
    }
    expect(breathed).toBe(true);
  });
});

describe('depth 7 · they hold the door sooner', () => {
  it('closes at half the hoard down to six', () => {
    for (const depth of [1, 6]) expect(depthRules(depth).sealAt).toBe(TUNING.SEAL_AT);
  });

  it('closes at a third from seven down', () => {
    expect(depthRules(TIGHT_DOOR_DEPTH).sealAt).toBe(TIGHT_SEAL_AT);
  });

  it('actually seals earlier in a run, not just in the table', () => {
    const s = mk(TIGHT_DOOR_DEPTH);
    // take 40%: not enough at the old line, enough at this one
    s.hoard.pool = s.hoard.pool0 * 0.6;
    step(s, IDLE);
    expect(s.sealed).toBe(true);

    const shallow = mk(1);
    shallow.hoard.pool = shallow.hoard.pool0 * 0.6;
    step(shallow, IDLE);
    expect(shallow.sealed).toBe(false);
  });
});

describe('what the player is told', () => {
  it('says nothing about a lair that plays by the ordinary rules', () => {
    expect(depthRules(1).lines).toEqual([]);
  });

  it('names every rule that is live, so none of them is a surprise', () => {
    expect(depthRules(GARRISON_DEPTH).lines).toHaveLength(1);
    expect(depthRules(LIGHT_SLEEPER_DEPTH).lines).toHaveLength(2);
    expect(depthRules(TIGHT_DOOR_DEPTH).lines).toHaveLength(3);
  });

  it('keeps saying them the deeper it goes — the rules stack, they do not swap', () => {
    const deep = depthRules(20);
    expect(deep.awakeGuards).toBe(2);
    expect(deep.startWake).toBe(TUNING.STAGE1_WAKE);
    expect(deep.sealAt).toBe(TIGHT_SEAL_AT);
    expect(deep.lines).toHaveLength(3);
  });
});
