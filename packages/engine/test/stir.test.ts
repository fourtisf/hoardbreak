/**
 * The sleeping wyrm.
 *
 * For the whole first half of a run the dragon was a wake meter with a sprite
 * attached. It never moved, so the hoard was somewhere you walked into and then
 * stood on, and the tile it slept on was the safest square in the lair right up
 * until the moment it was the deadliest. It now heaves over onto a new patch of
 * its bed, and once it is sleeping badly its tail comes round across the gold.
 *
 * Both are telegraphed and both are dodgeable — that is what separates this
 * from simply adding damage to standing still.
 */
import { describe, expect, it } from 'vitest';
import {
  MODS,
  T,
  TUNING,
  createRun,
  dailySeed,
  step,
  type InputFrame,
  type RunMeta,
  type RunState,
  type Unit,
} from '../src/headless.js';

const IDLE: InputFrame = { mx: 0, my: 0, mm: 0, commands: [] };

const meta = (): RunMeta => ({
  depth: 1,
  uid: 2,
  crew: [{ tid: 1, name: 'Rats', kind: 'bruiser', xp: 0 }],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

const mk = (): RunState => {
  const date = '2026-08-11';
  const s = createRun({ seed: dailySeed(date, 1), depth: 1, mod: MODS[4]!, meta: meta(), date });
  s.guards.length = 0; // guards would rather fight than let a test measure anything
  return s;
};
const run = (s: RunState, secs: number): void => {
  for (let i = 0; i < secs * 60; i++) step(s, IDLE);
};

describe('it turns over in its sleep', () => {
  it('does not spend the first half of the run standing perfectly still', () => {
    const s = mk();
    const x0 = s.dragon.x;
    const y0 = s.dragon.y;
    run(s, 30);
    expect(s.dragon.awake).toBe(false);
    expect(Math.hypot(s.dragon.x - x0, s.dragon.y - y0)).toBeGreaterThan(T);
  });

  it('never leaves its own bed', () => {
    const s = mk();
    const hh = s.hoard;
    for (let i = 0; i < 60 * 60; i++) {
      step(s, IDLE);
      if (s.dragon.awake) break;
      const gx = (s.dragon.x / T) | 0;
      const gy = (s.dragon.y / T) | 0;
      expect(gx).toBeGreaterThanOrEqual(hh.x0);
      expect(gx).toBeLessThanOrEqual(hh.x1);
      expect(gy).toBeGreaterThanOrEqual(hh.y0);
      expect(gy).toBeLessThanOrEqual(hh.y1);
    }
  });

  it('warns before it lands, so it can be walked out of', () => {
    const s = mk();
    let sawWarning = false;
    for (let i = 0; i < 60 * 30 && !sawWarning; i++) {
      step(s, IDLE);
      // the telegraph is on the board a beat before the timer fires
      if (s.timers.some((tm) => tm.k === 'roll') && s.tele.length) sawWarning = true;
    }
    expect(sawWarning).toBe(true);
  });

  it('crushes whoever is still underneath when it comes down', () => {
    const s = mk();
    const u = s.units[0] as Unit;
    u.hp = u.max = 1e6;
    let landed = false;
    for (let i = 0; i < 60 * 40 && !landed; i++) {
      step(s, IDLE);
      const roll = s.timers.find((tm) => tm.k === 'roll');
      if (!roll || roll.k !== 'roll') continue;
      // stand exactly where it is about to put itself down
      u.x = roll.x;
      u.y = roll.y;
      const hp = u.hp;
      while (s.timers.some((tm) => tm.k === 'roll')) {
        u.x = roll.x;
        u.y = roll.y;
        step(s, IDLE);
      }
      expect(u.hp).toBeLessThanOrEqual(hp - TUNING.ROLL_DMG);
      landed = true;
    }
    expect(landed).toBe(true);
  });

  it('throws them clear rather than pinning them under it', () => {
    const s = mk();
    const u = s.units[0] as Unit;
    u.hp = u.max = 1e6;
    let landed = false;
    for (let i = 0; i < 60 * 40 && !landed; i++) {
      step(s, IDLE);
      const roll = s.timers.find((tm) => tm.k === 'roll');
      if (!roll || roll.k !== 'roll') continue;
      while (s.timers.some((tm) => tm.k === 'roll')) {
        u.x = roll.x;
        u.y = roll.y;
        step(s, IDLE);
      }
      // being crushed and then left standing in the same square is a loop
      expect(Math.hypot(u.x - s.dragon.x, u.y - s.dragon.y)).toBeGreaterThan(0);
      landed = true;
    }
    expect(landed).toBe(true);
  });

  it('leaves anyone who stepped aside untouched', () => {
    const s = mk();
    const u = s.units[0] as Unit;
    u.hp = u.max = 1e6;
    const hp = u.hp;
    // parked well outside the hoard room for a full minute of stirring
    for (let i = 0; i < 60 * 40; i++) {
      u.x = 4 * T;
      u.y = 17 * T;
      step(s, IDLE);
      if (s.dragon.awake) break;
    }
    expect(u.hp).toBe(hp);
  });
});

describe('the tail', () => {
  it('stays down while the wyrm is sleeping soundly', () => {
    const s = mk();
    expect(s.stage).toBe(0);
    run(s, 20);
    expect(s.stage).toBe(0);
    expect(s.timers.some((tm) => tm.k === 'tail')).toBe(false);
  });

  it('comes round once one eye is open, and sweeps the whole pile', () => {
    const s = mk();
    const u = s.units[0] as Unit;
    u.hp = u.max = 1e6;
    let swept = false;
    for (let i = 0; i < 60 * 60 && !swept; i++) {
      // held at one eye open: this is a test of the tail, not of the wake curve
      s.wake = TUNING.STAGE1_WAKE + 1;
      s.stage = 1;
      // the far corner of the pile from the wyrm — the tail still reaches it
      u.x = (s.hoard.x1 + 0.5) * T;
      u.y = (s.hoard.y1 + 0.5) * T;
      const armed = s.timers.some((tm) => tm.k === 'tail');
      const hp = u.hp;
      step(s, IDLE);
      // only the tick the tail actually lands on counts — the sleeping breath
      // is also in the air and would otherwise be mistaken for it
      if (armed && !s.timers.some((tm) => tm.k === 'tail')) {
        expect(u.hp).toBeLessThanOrEqual(hp - TUNING.TAIL_DMG);
        swept = true;
      }
    }
    expect(swept).toBe(true);
  });

  it('says it is coming before it arrives', () => {
    const s = mk();
    let warned = false;
    for (let i = 0; i < 60 * 60 && !warned; i++) {
      s.wake = TUNING.STAGE1_WAKE + 1;
      s.stage = 1;
      step(s, IDLE);
      // the warning is on the board while the timer is still counting down
      if (s.out.feed.some((f) => f.msg.includes('tail draws back'))) {
        expect(s.timers.some((tm) => tm.k === 'tail')).toBe(true);
        warned = true;
      }
      s.out.feed.length = 0;
    }
    expect(warned).toBe(true);
  });

  it('cannot reach anyone who has stepped off the gold', () => {
    const s = mk();
    const u = s.units[0] as Unit;
    u.hp = u.max = 1e6;
    let checked = 0;
    for (let i = 0; i < 60 * 60 && checked < 3; i++) {
      s.wake = TUNING.STAGE1_WAKE + 1;
      s.stage = 1;
      // one tile clear of the pile's edge
      u.x = (s.hoard.x0 - 2) * T;
      u.y = (s.hoard.y1 + 3) * T;
      const armed = s.timers.some((tm) => tm.k === 'tail');
      const hp = u.hp;
      step(s, IDLE);
      // the sleeping breath can land on them out here, so measure only the
      // tick the tail resolves on — that is the one the tail is answerable for
      if (armed && !s.timers.some((tm) => tm.k === 'tail')) {
        expect(u.hp).toBe(hp);
        checked++;
      }
    }
    expect(checked).toBe(3);
  });
});

describe('an awake wyrm', () => {
  it('stops stirring — it has worse things to do', () => {
    const s = mk();
    s.wake = 100;
    run(s, 1);
    expect(s.dragon.awake).toBe(true);
    const x0 = s.dragon.x;
    run(s, 6);
    // it hunts now, which moves it, but never again by rolling over
    expect(s.timers.some((tm) => tm.k === 'roll' || tm.k === 'tail')).toBe(false);
    expect(typeof x0).toBe('number');
  });
});
