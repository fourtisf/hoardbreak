/**
 * The 20-check behavioural suite (handoff §12, Phase 1 acceptance).
 *
 * These are the prototype's QA checks re-implemented against the ported engine:
 * determinism, items, the staged dragon, XP/extraction accounting, prison
 * rescue. Every expected value is taken from `HOARDBREAK_v0.2.html` — when a
 * check fails, the port has drifted from the prototype, not the other way
 * round.
 *
 * Run with `pnpm test:engine`.
 */

import { describe, expect, it } from 'vitest';
import {
  MODS,
  RELIC_KEYS,
  abandonRun,
  SIM_DT,
  T,
  TUNING,
  UD,
  addWake,
  advance,
  bfs,
  createRun,
  dailySeed,
  extractReady,
  gi,
  inZone,
  maxLootFor,
  modFor,
  tileOf,
  snapshotJSON,
  step,
  unitDmgMul,
  useItem,
  type CrewKind,
  type InputFrame,
  type RunCommand,
  type RunState,
  type Unit,
} from '../src/headless.js';
import { DATE, hashState, mkGuard, mkMeta, mkRun, place, placePx, solo, thief } from './helpers.js';

const idle: InputFrame = { mx: 0, my: 0, mm: 0 };

/* ============================================================ *
 * 1–5 · determinism — the anti-cheat backbone (§5)
 * ============================================================ */

describe('01 · daily determinism', () => {
  it('the same date and depth always generate exactly the same lair', () => {
    for (const depth of [1, 2, 3, 5, 8]) {
      const a = mkRun({ depth });
      const b = mkRun({ depth });
      expect(snapshotJSON(b)).toBe(snapshotJSON(a));
      expect(a.hoard.pool0).toBe(b.hoard.pool0);
      expect(a.dragon.max).toBe(b.dragon.max);
    }
  });

  it('two players raiding the same day get identical guards, piles and chests', () => {
    const alfa = mkRun({ depth: 4 });
    // a different hideout must not change the lair — only the crew that enters it
    const mike = mkRun({
      depth: 4,
      meta: { crew: [thief(7, 'golem')], up: { dmg: 3, hp: 2, inc: 1 }, uid: 7 },
    });
    expect(snapshotJSON(mike)).toBe(snapshotJSON(alfa));
  });
});

describe('02 · seed sensitivity', () => {
  it('a different day, or a different depth, is a different lair', () => {
    const seen = new Set<string>();
    for (const date of ['2026-03-14', '2026-03-15', '2026-03-16']) {
      for (const depth of [1, 2, 3, 4]) seen.add(snapshotJSON(mkRun({ date, depth })));
    }
    expect(seen.size).toBe(12);
  });

  it('dailySeed is a pure function of the date:depth pair', () => {
    expect(dailySeed('2026-03-14', 1)).toBe(dailySeed('2026-03-14', 1));
    expect(dailySeed('2026-03-14', 1)).not.toBe(dailySeed('2026-03-14', 2));
    expect(dailySeed('2026-03-14', 1)).not.toBe(dailySeed('2026-03-15', 1));
    expect(dailySeed('2026-03-14', 1)).toBeGreaterThanOrEqual(0);
    expect(dailySeed('2026-03-14', 1)).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('03 · lair invariants', () => {
  it('every generated lair is playable: entrance, exit strip, reachable hoard', () => {
    for (const date of ['2026-01-01', '2026-03-14', '2026-07-04']) {
      for (let depth = 1; depth <= 8; depth++) {
        const s = mkRun({ date, depth });
        expect(s.exitTiles.length).toBe(10); // two columns × five rows
        for (const tile of s.exitTiles) expect(s.grid[tile]).toBe(1);
        // the crew spawns on floor and can walk to the gold
        expect(bfs(s.grid, 3, 16, 27, 5)).not.toBeNull();
        expect(s.shrine).not.toBeNull();
        expect(s.armory).not.toBeNull();
        expect(s.piles.length).toBeGreaterThan(0);
        expect(s.hoard.pool0).toBe(
          Math.round((TUNING.HOARD_BASE + TUNING.HOARD_PER_DEPTH * depth) * (s.mod.hoardMul || 1)),
        );
        expect(s.dragon.max).toBe(TUNING.DRAGON_HP_BASE + TUNING.DRAGON_HP_PER_DEPTH * depth);
      }
    }
  });

  it('depth scales guards, and the seed-bound loot ceiling covers what is there', () => {
    const shallow = mkRun({ depth: 1 });
    const deep = mkRun({ depth: 6 });
    expect(deep.guards.length).toBeGreaterThan(shallow.guards.length);
    const ceiling = maxLootFor(deep);
    const onTheFloor = deep.piles.reduce((a, p) => a + p.amt, 0) + deep.chests.reduce((a, c) => a + c.amt, 0);
    expect(ceiling).toBeGreaterThan(onTheFloor + deep.hoard.pool0);
  });
});

describe('04 · daily modifier', () => {
  it('modFor is deterministic, drawn from the five published modifiers', () => {
    for (let depth = 1; depth <= 12; depth++) {
      const m = modFor(DATE, depth);
      expect(MODS.map((x) => x.id)).toContain(m.id);
      expect(modFor(DATE, depth)).toBe(m);
    }
    const spread = new Set(Array.from({ length: 20 }, (_, i) => modFor(DATE, i + 1).id));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('modifiers actually change the lair they name', () => {
    const gilded = mkRun({ mod: 'gilded' });
    const quiet = mkRun({ mod: 'quiet' });
    const restless = mkRun({ mod: 'restless' });
    const garrison = mkRun({ mod: 'garrison' });
    expect(gilded.piles.reduce((a, p) => a + p.amt, 0)).toBeGreaterThan(
      quiet.piles.reduce((a, p) => a + p.amt, 0),
    );
    expect(restless.hoard.pool0).toBe(Math.round(quiet.hoard.pool0 * 1.5));
    expect(garrison.guards.length).toBeGreaterThan(quiet.guards.length);
    expect(garrison.guards[0]!.max).toBeCloseTo(quiet.guards[0]!.max * 1.2, 6);
  });
});

describe('05 · fixed-timestep determinism', () => {
  it('the same input log replays to a byte-identical state', () => {
    const script = (tick: number): InputFrame => {
      const a = tick * 0.017;
      const commands: RunCommand[] = [];
      if (tick === 90) commands.push({ c: 'item', k: 'smoke' });
      if (tick === 240) commands.push({ c: 'move', x: 14, y: 10 });
      if (tick === 480) commands.push({ c: 'item', k: 'trap' });
      return { mx: Math.cos(a), my: Math.sin(a), mm: 1, commands };
    };
    const opts = { depth: 3, meta: { items: { smoke: 1, lull: 1, trap: 1 }, up: { dmg: 0, hp: 10, inc: 0 } } };
    const a = mkRun(opts);
    const b = mkRun(opts);
    advance(a, 12, script);
    advance(b, 12, script);
    expect(a.ticks).toBe(720);
    expect(hashState(b)).toBe(hashState(a));
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
  });

  it('one step is always exactly 1/60 s of simulated time, whatever the frame rate', () => {
    const s = mkRun();
    for (let i = 0; i < 137; i++) step(s, idle);
    expect(s.ticks).toBe(137);
    expect(s.t).toBeCloseTo(137 * SIM_DT, 9);
  });
});

/* ============================================================ *
 * 6–7 · loot
 * ============================================================ */

describe('06 · loot piles', () => {
  it('walking over a pile banks it, logs it and removes it', () => {
    const s = mkRun();
    const u = solo(s);
    s.piles.length = 0;
    s.piles.push({ x: u.x, y: u.y, amt: 77 });
    step(s, idle);
    expect(s.loot).toBe(77);
    expect(s.piles.length).toBe(0);
    expect(s.events.some((e) => e[1] === 'LOOT_PILE' && e[2] === 77)).toBe(true);
  });

  it('Greedy Gauntlets pay +30% on piles', () => {
    const s = mkRun();
    const u = solo(s);
    s.relics.greed = 1;
    s.piles.length = 0;
    s.piles.push({ x: u.x, y: u.y, amt: 100 });
    step(s, idle);
    expect(s.loot).toBe(130);
  });
});

describe('07 · vault chests', () => {
  const crack = (s: RunState, u: Unit, amt = 300): void => {
    s.chests.length = 0;
    s.chests.push({ x: u.x, y: u.y, amt, prog: 0, open: false });
  };

  it('takes 1.3 s, and a Picklock does it twice as fast', () => {
    const slow = mkRun();
    const hexer = solo(slow, 'hexer');
    crack(slow, hexer);
    advance(slow, 1.2);
    expect(slow.chests[0]!.open).toBe(false);
    advance(slow, 0.2);
    expect(slow.chests[0]!.open).toBe(true);

    const fast = mkRun();
    const pick = solo(fast, 'picklock');
    crack(fast, pick);
    advance(fast, 0.6);
    expect(fast.chests[0]!.open).toBe(false);
    advance(fast, 0.1);
    expect(fast.chests[0]!.open).toBe(true);
  });

  it('Lockbreaker springs it open instantly', () => {
    const s = mkRun();
    const u = solo(s, 'hexer');
    s.relics.lock = 1;
    crack(s, u);
    step(s, idle);
    expect(s.chests[0]!.open).toBe(true);
  });

  it('cracking one banks the gold and costs 8 wake', () => {
    const s = mkRun();
    const u = solo(s, 'picklock');
    crack(s, u, 420);
    advance(s, 0.6);
    const before = s.wake;
    advance(s, 0.15);
    expect(s.chests[0]!.open).toBe(true);
    expect(s.loot).toBe(420);
    expect(s.wake - before).toBeGreaterThan(7.9);
    expect(s.wake - before).toBeLessThan(8.2);
    expect(s.events.some((e) => e[1] === 'CHEST' && e[2] === 420)).toBe(true);
  });

  it('progress bleeds away when the crew walks off', () => {
    const s = mkRun();
    const u = solo(s, 'hexer');
    crack(s, u);
    advance(s, 0.5);
    expect(s.chests[0]!.prog).toBeGreaterThan(0.4);
    place(u, 1, 1);
    advance(s, 1);
    expect(s.chests[0]!.prog).toBe(0);
    expect(s.chests[0]!.open).toBe(false);
  });
});

/* ============================================================ *
 * 8–10 · items
 * ============================================================ */

describe('08 · smoke bomb', () => {
  it('drops every alert and blinds the guards for 4 s', () => {
    const s = mkRun({ meta: { items: { smoke: 1, lull: 0, trap: 0 } } });
    s.revealed.fill(1);
    const u = s.units[0] as Unit;
    place(u, 10, 10);
    s.guards.length = 0;
    const g = mkGuard(s, 'guard', u.x + T, u.y, { hp: 85, max: 85, alert: true });

    expect(useItem(s, 'smoke')).toBe(true);
    expect(g.alert).toBe(false);
    expect(s.smokeT).toBe(TUNING.SMOKE_TIME);
    expect(s.items.smoke).toBe(0);
    expect(s.itemsUsed.smoke).toBe(1);
    expect(s.events.some((e) => e[1] === 'ITEM_USE' && e[2] === 0)).toBe(true);

    // blind: standing right next to the crew, it still cannot see them
    advance(s, 3.5);
    expect(g.alert).toBe(false);
    // …until the smoke clears
    advance(s, 1.5);
    expect(g.alert).toBe(true);
  });

  it('refuses to burn an item you do not have', () => {
    const s = mkRun();
    expect(useItem(s, 'smoke')).toBe(false);
    expect(s.itemsUsed.smoke).toBe(0);
  });
});

describe('09 · lullaby powder', () => {
  it('takes 25 straight off the wake meter', () => {
    const s = mkRun({ meta: { items: { smoke: 0, lull: 1, trap: 0 } } });
    s.wake = 40;
    expect(useItem(s, 'lull')).toBe(true);
    expect(s.wake).toBe(15);
    expect(s.items.lull).toBe(0);
  });

  it('never takes the meter below zero', () => {
    const s = mkRun({ meta: { items: { smoke: 0, lull: 1, trap: 0 } } });
    s.wake = 10;
    useItem(s, 'lull');
    expect(s.wake).toBe(0);
  });

  it('is refused — and not consumed — once the wyrm is awake', () => {
    const s = mkRun({ meta: { items: { smoke: 0, lull: 1, trap: 0 } } });
    s.wake = 100;
    step(s, idle);
    expect(s.dragon.awake).toBe(true);
    expect(useItem(s, 'lull')).toBe(false);
    expect(s.items.lull).toBe(1);
  });
});

describe('10 · bear trap', () => {
  it('drops at the lead thief and snaps the first guard into it', () => {
    const s = mkRun({ meta: { items: { smoke: 0, lull: 0, trap: 1 } } });
    s.revealed.fill(1);
    const u = solo(s);
    place(u, 12, 12);
    useItem(s, 'trap');
    expect(s.traps.length).toBe(1);
    expect(s.traps[0]!.x).toBe(u.x);
    expect(s.traps[0]!.y).toBe(u.y);

    const trap = s.traps[0]!;
    place(u, 2, 17); // the crew walks on; only the trap should touch this guard
    const g = mkGuard(s, 'warden', trap.x, trap.y);
    step(s, idle);
    expect(g.hp).toBe(400 - TUNING.TRAP_GUARD_DMG);
    expect(g.stun).toBeGreaterThan(TUNING.TRAP_GUARD_STUN - SIM_DT - 1e-9);
    expect(s.traps[0]!.armed).toBe(false);
  });

  it('bites an awake wyrm for 150 and stuns it for 2.5 s', () => {
    const s = mkRun({ meta: { items: { smoke: 0, lull: 0, trap: 1 } } });
    solo(s);
    s.wake = 100;
    step(s, idle);
    expect(s.dragon.awake).toBe(true);
    const hp = s.dragon.hp;
    s.traps.push({ x: s.dragon.x, y: s.dragon.y, armed: true });
    step(s, idle);
    expect(s.dragon.hp).toBe(hp - TUNING.TRAP_DRAGON_DMG);
    expect(s.dragon.stunT).toBeGreaterThan(TUNING.TRAP_DRAGON_STUN - SIM_DT - 1e-9);
  });
});

/* ============================================================ *
 * 11–14 · the staged dragon
 * ============================================================ */

describe('11 · stage 1 — one eye opens at 50%', () => {
  it('crosses into stage 1 and starts breathing in its sleep', () => {
    const s = mkRun();
    solo(s);
    expect(s.stage).toBe(0);
    s.wake = 49;
    step(s, idle);
    expect(s.stage).toBe(0);

    s.wake = 50;
    step(s, idle);
    expect(s.stage).toBe(1);
    expect(s.events.some((e) => e[1] === 'WAKE_MILESTONE' && e[2] === 50)).toBe(true);
    expect(s.dragon.awake).toBe(false);

    // the first sleeping breath lands ~6 s later, then every 6.5 s
    advance(s, 5.9);
    expect(s.tele.length).toBe(0);
    advance(s, 0.2);
    expect(s.tele.length).toBe(1);
    expect(s.dragon.scd).toBeGreaterThan(TUNING.SLEEP_BREATH_CD - 0.2);
    expect(s.dragon.scd).toBeLessThanOrEqual(TUNING.SLEEP_BREATH_CD);
  });

  it('a sleeping breath deals 55, reduced by Emberkin scales and Ember Ward', () => {
    const bare = mkRun();
    const u = solo(bare, 'hexer');
    u.hp = 1000;
    bare.wake = 50;
    bare.stage = 1;
    bare.dragon.scd = 0.001;
    step(bare, idle);
    expect(bare.tele.length).toBe(1);
    placePx(u, bare.tele[0]!.x, bare.tele[0]!.y);
    advance(bare, 0.65);
    expect(1000 - u.hp).toBeCloseTo(TUNING.SLEEP_BREATH_DMG, 6);

    const warded = mkRun();
    const w = solo(warded, 'hexer');
    w.hp = 1000;
    warded.relics.ward = 1;
    warded.stage = 1;
    warded.dragon.scd = 0.001;
    step(warded, idle);
    placePx(w, warded.tele[0]!.x, warded.tele[0]!.y);
    advance(warded, 0.65);
    expect(1000 - w.hp).toBeCloseTo(TUNING.SLEEP_BREATH_DMG * TUNING.WARD_MUL, 6);

    // Emberkin resists dragonfire by half
    expect(UD.emberkin.fireRes).toBe(0.5);
  });
});

describe('12 · stage 2 — the guards stir at 75%', () => {
  it('spawns two alerted reinforcements at the hoard edge and speeds the breath up', () => {
    const s = mkRun();
    solo(s);
    s.guards.length = 0;
    s.wake = 75;
    step(s, idle);
    expect(s.stage).toBe(2);
    expect(s.events.some((e) => e[1] === 'WAKE_MILESTONE' && e[2] === 75)).toBe(true);
    expect(s.guards.length).toBe(2);
    expect(s.guards.every((g) => g.alert)).toBe(true);
    expect(s.guards.map((g) => g.k).sort()).toEqual(['guard', 'sentinel']);
    for (const g of s.guards) expect((g.x / T) | 0).toBe(s.hoard.x0 - 1);

    s.dragon.scd = 0.001;
    step(s, idle);
    expect(s.dragon.scd).toBeCloseTo(TUNING.SLEEP_BREATH_CD_S2, 6);
  });
});

describe('13 · 100% — it hunts', () => {
  it('wakes, flies straight at the crew through solid rock, and stops accruing wake', () => {
    const s = mkRun();
    const u = solo(s);
    place(u, 4, 17);
    s.wake = 100;
    step(s, idle);
    expect(s.dragon.awake).toBe(true);
    expect(s.events.some((e) => e[1] === 'WAKE_MILESTONE' && e[2] === 100)).toBe(true);

    const before = Math.hypot(s.dragon.x - u.x, s.dragon.y - u.y);
    advance(s, 1);
    const after = Math.hypot(s.dragon.x - u.x, s.dragon.y - u.y);
    expect(before - after).toBeCloseTo(TUNING.DRAGON_SPD, 0);

    // it crossed the map in a straight line — over solid rock on the way
    let overRock = false;
    for (let i = 0; i < 240; i++) {
      step(s, idle);
      if (s.grid[gi((s.dragon.x / T) | 0, (s.dragon.y / T) | 0)] === 0) overRock = true;
    }
    expect(overRock).toBe(true);

    const wake = s.wake;
    addWake(s, 50);
    expect(s.wake).toBe(wake);
  });
});

describe('14 · wake multipliers', () => {
  it('Sleepy Incense, the daily modifier and Muffled Boots all scale noise', () => {
    const plain = mkRun({ mod: 'quiet' });
    addWake(plain, 10);
    expect(plain.wake).toBeCloseTo(10, 9);

    const incense = mkRun({ mod: 'quiet', meta: { up: { dmg: 0, hp: 0, inc: 2 } } });
    addWake(incense, 10);
    expect(incense.wake).toBeCloseTo(10 * 0.8 * 0.8, 9);

    const restless = mkRun({ mod: 'restless' });
    addWake(restless, 10);
    expect(restless.wake).toBeCloseTo(12.5, 9);

    const booted = mkRun({ mod: 'quiet' });
    booted.relics.boots = 1;
    addWake(booted, 10);
    expect(booted.wake).toBeCloseTo(8, 9);

    const both = mkRun({ mod: 'restless', meta: { up: { dmg: 0, hp: 0, inc: 3 } } });
    both.relics.boots = 1;
    addWake(both, 100);
    expect(both.wake).toBeCloseTo(100 * 0.8 ** 3 * 1.25 * 0.8, 9);
  });

  it('the meter is capped at 100 and noise sources cost what §10 says', () => {
    const s = mkRun({ mod: 'quiet' });
    addWake(s, 500);
    expect(s.wake).toBe(100);

    const g = mkRun({ mod: 'quiet' });
    solo(g);
    const before = g.wake;
    mkGuard(g, 'guard', 10 * T, 10 * T, { hp: 0, max: 85 });
    step(g, idle);
    // a dead guard is +10 gold and +6 wake (plus the 0.9/s passive tick)
    expect(g.loot).toBe(TUNING.GUARD_BOUNTY);
    expect(g.wake - before).toBeGreaterThan(TUNING.WAKE_GUARD_KILL);
    expect(g.wake - before).toBeLessThan(TUNING.WAKE_GUARD_KILL + 0.1);
  });
});

/* ============================================================ *
 * 15–16 · the hoard and the prison
 * ============================================================ */

/*
 * The rate below is the prototype's, and these place their thieves on the rim
 * of the hoard on purpose: the coins under the wyrm itself pay a multiple of it
 * (v0.3, `test/deep.test.ts`). Standing on tile 27,5 — where these used to
 * stand — is now the deep gold, so it would measure the wrong number.
 */
describe('15 · siphoning the hoard', () => {
  it('pays 60 g/s per thief standing on the rim of the pile', () => {
    const s = mkRun();
    const u = solo(s);
    place(u, 28, 7);
    const pool = s.hoard.pool;
    advance(s, 1);
    expect(s.loot).toBeCloseTo(TUNING.SIPHON_RATE, 6);
    expect(s.hoard.pool).toBeCloseTo(pool - TUNING.SIPHON_RATE, 6);
    expect(s.events.some((e) => e[1] === 'SIPHON_TICK')).toBe(true);
  });

  it('two thieves siphon twice as fast', () => {
    const s = mkRun();
    s.guards.length = 0;
    s.revealed.fill(1);
    s.units.length = 2;
    for (const u of s.units) {
      u.hp = 1e6;
      u.max = 1e6;
      place(u, 28, 7);
    }
    advance(s, 1);
    expect(s.loot).toBeCloseTo(TUNING.SIPHON_RATE * 2, 6);
  });

  it('Greedy Gauntlets pay +30% without draining the hoard any faster', () => {
    const s = mkRun();
    const u = solo(s);
    s.relics.greed = 1;
    place(u, 28, 7);
    const pool = s.hoard.pool;
    advance(s, 1);
    expect(s.loot).toBeCloseTo(TUNING.SIPHON_RATE * TUNING.GREED_MUL, 6);
    expect(s.hoard.pool).toBeCloseTo(pool - TUNING.SIPHON_RATE, 6);
  });
});

describe('16 · prison rescue', () => {
  it('a fallen friend is waiting, and 1.6 s of work brings them back', () => {
    const lost = thief(9, 'hexer', 3);
    const s = mkRun({ depth: 2, meta: { lost: [lost] } });
    expect(s.prison).not.toBeNull();
    const pr = s.prison!;
    expect(pr.fromQ).toBe(true);
    expect(pr.thief.tid).toBe(9);

    const u = solo(s);
    placePx(u, pr.x, pr.y);
    const wake = s.wake;
    advance(s, 1.5);
    expect(pr.done).toBe(false);
    advance(s, 0.2);

    expect(pr.done).toBe(true);
    expect(s.units.length).toBe(2);
    const freed = s.units[1] as Unit;
    expect(freed.tid).toBe(9);
    expect(freed.rescued).toBe(true);
    expect(freed.lv).toBe(3); // level 3 from 3 XP
    expect(freed.max).toBeCloseTo(UD.hexer.hp * (1 + TUNING.XP_STAT_PER_LEVEL * 3), 6);
    expect(s.wake - wake).toBeGreaterThan(TUNING.WAKE_RESCUE);
    expect(s.events.some((e) => e[1] === 'RESCUE' && e[2] === 9)).toBe(true);
    expect(s.crewOps).toContainEqual({ op: 'freeFromQueue', tid: 9 });
  });

  it('with an empty lost queue the lair mints a fresh prisoner and reserves their id', () => {
    const s = mkRun({ depth: 3 });
    expect(s.prison).not.toBeNull();
    expect(s.prison!.fromQ).toBe(false);
    expect(s.freshPrisonerTid).toBe(5); // meta.uid was 4
    expect(s.prison!.thief.name).toBe('Moss'); // NAMES[4]
    expect(s.crewOps.filter((o) => o.op === 'freeFromQueue')).toHaveLength(0);
  });
});

/* ============================================================ *
 * 17–18 · getting out
 * ============================================================ */

describe('17 · extraction accounting', () => {
  it('banks the loot, counts the survivors and leaves stragglers behind', () => {
    const s = mkRun();
    s.guards.length = 0;
    s.revealed.fill(1);
    place(s.units[0] as Unit, 2, 16);
    place(s.units[1] as Unit, 2, 17);
    place(s.units[2] as Unit, 3, 18);
    place(s.units[3] as Unit, 20, 10); // still deep in the lair

    expect(extractReady(s)).toBe(3);
    s.loot = 1234;
    s.hoard.pool = s.hoard.pool0 * 0.25;

    step(s, { ...idle, commands: [{ c: 'extract' }] });

    const r = s.result!;
    expect(s.over).toBe(true);
    expect(r.success).toBe(true);
    expect(r.slain).toBe(false);
    expect(r.loot).toBe(1234);
    expect(r.stolenPct).toBe(75);
    expect(r.survivorsTids.sort()).toEqual([1, 2, 3]);
    expect(r.crewLostTids).toEqual([4]);
    expect(r.crewOps).toEqual([{ op: 'lose', tid: 4 }]);
    expect(r.crewLost).toBe(1);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.events.some((e) => e[1] === 'EXTRACT' && e[2] === 1234)).toBe(true);
  });

  it('EXTRACT is refused while nobody is standing on the green tiles', () => {
    const s = mkRun();
    s.guards.length = 0;
    for (const u of s.units) place(u, 20, 10);
    expect(extractReady(s)).toBe(0);
    step(s, { ...idle, commands: [{ c: 'extract' }] });
    expect(s.over).toBe(false);
  });

  it('a rescued thief only comes home if they reach the exit', () => {
    const lost = thief(9, 'bruiser');
    const s = mkRun({ depth: 2, meta: { lost: [lost] } });
    const u = solo(s);
    const pr = s.prison!;
    placePx(u, pr.x, pr.y);
    advance(s, 1.8);
    const freed = s.units[1] as Unit;
    expect(freed.tid).toBe(9);

    place(u, 2, 17);
    place(freed, 2, 18);
    step(s, { ...idle, commands: [{ c: 'extract' }] });
    expect(s.result!.rescue).toEqual({ thief: lost, fromQueue: true, extracted: true });
    expect(s.result!.rescuedTid).toBe(9);
  });
});

describe('18 · wyrmslayer', () => {
  it('killing it pays 2000, ends the run in triumph and nobody is left behind', () => {
    const s = mkRun();
    const u = solo(s, 'bruiser');
    s.wake = 100;
    step(s, idle);
    expect(s.dragon.awake).toBe(true);

    s.guards.length = 0; // the 75% reinforcements would soak the swings
    s.dragon.hp = 1;
    place(u, 20, 10); // deliberately nowhere near the exit
    placePx(u, s.dragon.x, s.dragon.y);

    advance(s, 0.5);
    expect(s.slain).toBe(true);
    expect(s.loot).toBeGreaterThanOrEqual(TUNING.SLAY_BONUS);
    expect(s.over).toBe(false); // the fanfare runs first

    advance(s, 1.5);
    expect(s.over).toBe(true);
    const r = s.result!;
    expect(r.success).toBe(true);
    expect(r.slain).toBe(true);
    expect(r.crewLostTids).toEqual([]);
    expect(r.survivorsTids).toEqual([u.tid]);
  });
});

/* ============================================================ *
 * 19–20 · rooms and ruin
 * ============================================================ */

describe('19 · shrines and armouries', () => {
  it('a shrine lays out two relics and you walk into the one you want', () => {
    const s = mkRun();
    const u = solo(s);
    const sh = s.shrine!;
    placePx(u, sh.x, sh.y);
    const wake = s.wake;
    advance(s, 1.1);
    expect(sh.done).toBe(false);
    advance(s, 0.2);

    expect(sh.done).toBe(true);
    expect(s.relicOffers).toHaveLength(2);
    expect(s.relicOffers[0]!.k).not.toBe(s.relicOffers[1]!.k);
    for (const o of s.relicOffers) expect(RELIC_KEYS).toContain(o.k);
    // channelling the shrine is the noise; taking the relic is free
    expect(s.wake - wake).toBeGreaterThan(TUNING.WAKE_SHRINE);
    expect(s.events.some((e) => e[1] === 'SHRINE')).toBe(true);
    // standing on the shrine itself does not decide for you
    expect(Object.keys(s.relics)).toHaveLength(0);

    const wanted = s.relicOffers[1]!;
    placePx(u, wanted.x, wanted.y);
    step(s, idle);
    expect(s.relics[wanted.k]).toBe(1);
    expect(Object.keys(s.relics)).toHaveLength(1); // the other one crumbled
    expect(s.relicOffers).toHaveLength(0);
    expect(s.events.some((e) => e[1] === 'RELIC' && e[2] === RELIC_KEYS.indexOf(wanted.k))).toBe(true);
  });

  it('hands the last relic straight over — a choice of one is not a choice', () => {
    const nearly = mkRun();
    const n = solo(nearly);
    for (const k of RELIC_KEYS.slice(0, 4)) nearly.relics[k] = 1;
    placePx(n, nearly.shrine!.x, nearly.shrine!.y);
    advance(nearly, 1.4);
    expect(nearly.relicOffers).toHaveLength(0);
    expect(nearly.relics[RELIC_KEYS[4] as (typeof RELIC_KEYS)[number]]).toBe(1);

    const rich = mkRun();
    const r = solo(rich);
    for (const k of RELIC_KEYS) rich.relics[k] = 1;
    placePx(r, rich.shrine!.x, rich.shrine!.y);
    advance(rich, 1.4);
    expect(rich.shrine!.done).toBe(true);
    expect(rich.relicOffers).toHaveLength(0);
    expect(rich.loot).toBe(TUNING.SHRINE_OVERFLOW);
  });

  it('an armoury sharpens the whole crew, once', () => {
    const s = mkRun();
    const u = solo(s);
    const before = unitDmgMul(s, u);
    placePx(u, s.armory!.x, s.armory!.y);
    step(s, idle);
    expect(s.armory!.done).toBe(true);
    expect(s.runDmg).toBeCloseTo(TUNING.ARMORY_DMG, 9);
    expect(unitDmgMul(s, u)).toBeCloseTo(before * 1.15, 9);
    expect(s.events.filter((e) => e[1] === 'ARMORY')).toHaveLength(1);

    advance(s, 1);
    expect(s.runDmg).toBeCloseTo(TUNING.ARMORY_DMG, 9); // not stacking
  });
});

describe('20 · the wyrm feeds', () => {
  it('losing the whole crew ends the run, forfeits the loot and fills the prisons', () => {
    const s = mkRun();
    s.guards.length = 0;
    s.loot = 5000;
    for (const u of s.units) u.hp = 0;
    step(s, idle);

    expect(s.over).toBe(true);
    const r = s.result!;
    expect(r.success).toBe(false);
    expect(r.loot).toBe(5000); // reported, but the meta layer banks nothing on a wipe
    expect(r.crewLost).toBe(4);
    expect(r.crewLostTids.sort()).toEqual([1, 2, 3, 4]);
    expect(r.survivorsTids).toEqual([]);
    // the death sweep walks the squad back-to-front, as the prototype did
    expect(r.crewOps).toEqual([
      { op: 'lose', tid: 4 },
      { op: 'lose', tid: 3 },
      { op: 'lose', tid: 2 },
      { op: 'lose', tid: 1 },
    ]);
  });

  it("a Picklock's death burst still hurts whoever stood over the body", () => {
    const s = mkRun();
    s.revealed.fill(1);
    const u = solo(s, 'picklock');
    s.guards.length = 0;
    // outside the Picklock's 0.85-tile reach, inside the 1.3-tile death burst
    const g = mkGuard(s, 'high', u.x + 26, u.y, { hp: 600, max: 600, alert: true, cd: 999, stun: 99 });
    u.hp = 0;
    step(s, idle);
    expect(600 - g.hp).toBeCloseTo(UD.picklock.burst as number, 6);
  });
});

/* ---------------------------------------------------------------- *
 * The snapshot contract the server will validate against (§5, §6).
 * ---------------------------------------------------------------- */

describe('snapshot contract', () => {
  it('matches the prototype HB.snapshot() shape', () => {
    const s = createRun({
      seed: dailySeed(DATE, 2),
      depth: 2,
      mod: modFor(DATE, 2),
      meta: mkMeta({ depth: 2 }),
      date: DATE,
    });
    const snap = JSON.parse(snapshotJSON(s)) as {
      mod: string;
      g: [string, number, number][];
      p: [number, number, number][];
      c: [number, number, number][];
    };
    expect(Object.keys(snap).sort()).toEqual(['c', 'g', 'mod', 'p']);
    expect(snap.mod).toBe(s.mod.id);
    expect(snap.g).toHaveLength(s.guards.length);
    expect(snap.g[0]).toHaveLength(3);
    expect(Number.isInteger(snap.p[0]![2])).toBe(true);
  });
});

/* ============================================================ *
 * v0.3 design changes — the deliberate divergences from the
 * prototype, each pinned so it cannot regress or drift back.
 * ============================================================ */

describe('v0.3 · nobody spawns inside the extraction zone', () => {
  it('the crew starts outside the green tiles, so EXTRACT is always a choice', () => {
    const s = mkRun({ meta: { crew: Array.from({ length: 9 }, (_, i) => thief(i + 1, 'picklock')) } });
    expect(s.units).toHaveLength(9);
    expect(extractReady(s)).toBe(0);
    for (const u of s.units) {
      expect(inZone(s, u)).toBe(false);
      // still inside the entrance room, still on floor
      expect(s.grid[tileOf(u.x, u.y)]).toBe(1);
    }
  });

  it('walking two tiles left still reaches the exit', () => {
    const s = mkRun();
    s.guards.length = 0;
    for (const u of s.units) place(u, 2, 17);
    expect(extractReady(s)).toBe(s.units.length);
  });
});

describe('v0.3 · creep makes stealth a mechanic, not a timer', () => {
  const creeping = { mx: 0, my: 0, mm: 0, creep: true };

  it('halves the pace and cuts passive noise by more than half', () => {
    const loud = mkRun({ mod: 'quiet' });
    solo(loud);
    advance(loud, 2);

    const quiet = mkRun({ mod: 'quiet' });
    solo(quiet);
    advance(quiet, 2, creeping);

    expect(quiet.wake).toBeLessThan(loud.wake);
    expect(quiet.wake / loud.wake).toBeCloseTo(TUNING.CREEP_WAKE_MUL, 2);
  });

  it('shrinks the radius a guard notices you from', () => {
    const mk = (creep: boolean): RunState => {
      const s = mkRun({ mod: 'quiet' });
      s.revealed.fill(1);
      const u = solo(s);
      place(u, 12, 12);
      // just outside creeping range, comfortably inside walking range
      mkGuard(s, 'guard', u.x + TUNING.DETECT_R * T * 0.8, u.y, { hp: 85, max: 85 });
      advance(s, 0.2, creep ? creeping : idle);
      return s;
    };
    expect(mk(false).guards[0]!.alert).toBe(true);
    expect(mk(true).guards[0]!.alert).toBe(false);
  });

  it('costs real time — the trade is pace for silence', () => {
    const dash = mkRun({ mod: 'quiet' });
    const sneak = mkRun({ mod: 'quiet' });
    for (const s of [dash, sneak]) {
      s.guards.length = 0;
      s.units.length = 1;
      place(s.units[0] as Unit, 3, 17); // the entrance room, so there is floor to run on
    }
    const run = { mx: 1, my: 0, mm: 1 };
    advance(dash, 0.4, run);
    advance(sneak, 0.4, { ...run, creep: true });
    const moved = (s: RunState): number => (s.units[0] as Unit).x - (3 * T + T / 2);
    expect(moved(sneak) / moved(dash)).toBeCloseTo(TUNING.CREEP_SPEED_MUL, 2);
  });

  it('does not quiet the hoard — siphoning is as loud as it ever was', () => {
    const mk = (creep: boolean): number => {
      const s = mkRun({ mod: 'quiet' });
      const u = solo(s);
      place(u, 28, 7);
      const before = s.wake;
      advance(s, 1, creep ? creeping : idle);
      return s.wake - before;
    };
    // the only difference is the passive 0.9/s underneath; the siphon's 18/s
    // and the dragon-proximity 2.2/s are untouched
    expect(mk(true)).toBeGreaterThan(mk(false) * 0.9);
  });
});

describe('v0.3 · classes pick their targets differently', () => {
  /** One thief of the class under test, in the entrance room (always carved). */
  const lone = (kind: CrewKind): RunState => {
    const s = mkRun({ mod: 'quiet', meta: { crew: [thief(1, kind)] } });
    s.revealed.fill(1);
    const u = solo(s);
    place(u, 5, 17);
    return s;
  };
  const at = (s: RunState, k: Parameters<typeof mkGuard>[1], dx: number, over = {}) =>
    mkGuard(s, k, (s.units[0] as Unit).x + dx, (s.units[0] as Unit).y, { alert: true, ...over });

  it('the Hexer curses the biggest thing in reach, not the closest', () => {
    const s = lone('hexer'); // 3.4-tile reach — both are comfortably inside it
    const runt = at(s, 'guard', 30, { hp: 85, max: 85 });
    const brute = at(s, 'high', 70, { hp: 520, max: 520 });
    advance(s, 0.3);
    expect(brute.hex).toBeGreaterThan(0);
    expect(runt.hex).toBe(0);
    expect(brute.hp).toBeLessThan(520);
    expect(runt.hp).toBe(85);
  });

  it('the Emberkin spreads fire instead of stacking it', () => {
    const s = lone('emberkin'); // 2.9-tile reach
    const alight = at(s, 'guard', 25, { burn: 3 });
    const fresh = at(s, 'guard', 55);
    advance(s, 0.3);
    expect(fresh.burn).toBeGreaterThan(0);
    expect(fresh.hp).toBeLessThan(alight.hp);
  });

  it('the Bruiser body-blocks the hardest hitter', () => {
    const s = lone('bruiser'); // 0.9-tile reach — keep both inside it
    const soft = at(s, 'acolyte', 12); //  5 dps
    const heavy = at(s, 'high', 19); // 22 dps
    advance(s, 0.5);
    expect(heavy.hp).toBeLessThan(soft.hp);
    expect(soft.hp).toBe(400);
  });

  it('a Picklock still just swings at whatever is nearest', () => {
    const s = lone('picklock'); // 0.85-tile reach
    const near = at(s, 'guard', 14);
    const far = at(s, 'high', 19);
    advance(s, 0.4);
    expect(near.hp).toBeLessThan(far.hp);
  });

  it('once a thief commits to a target it stops flip-flopping', () => {
    const s = lone('hexer');
    const a = at(s, 'high', 40, { hp: 520, max: 520 });
    const b = at(s, 'high', 45, { hp: 520, max: 520 });
    advance(s, 1);
    // one of them is being killed; the other is untouched
    const hit = [a, b].filter((g) => g.hp < 520);
    expect(hit).toHaveLength(1);
  });
});

describe('v0.3 · the daily rotation is wider', () => {
  it('eight nights, all reachable, none of them duplicates', () => {
    expect(MODS).toHaveLength(8);
    expect(new Set(MODS.map((m) => m.id)).size).toBe(8);
    const seen = new Set<string>();
    for (let d = 1; d <= 400; d++) seen.add(modFor(DATE, d).id);
    expect(seen.size).toBe(8);
  });

  it('A HUNGRY WYRM sleeps deeper but burns hotter', () => {
    const s = mkRun({ mod: 'hungry' });
    const u = solo(s, 'hexer');
    u.hp = 1000;
    s.stage = 1;
    s.dragon.scd = 0.001;
    step(s, idle);
    placePx(u, s.tele[0]!.x, s.tele[0]!.y);
    advance(s, 0.65);
    expect(1000 - u.hp).toBeCloseTo(TUNING.SLEEP_BREATH_DMG * 1.45, 6);

    const calm = mkRun({ mod: 'hungry' });
    addWake(calm, 10);
    expect(calm.wake).toBeCloseTo(8.5, 9);
  });

  it('SILENT HALLS shrinks the detection radius without going negative', () => {
    const s = mkRun({ mod: 'silent' });
    s.revealed.fill(1);
    const u = solo(s);
    place(u, 12, 12);
    mkGuard(s, 'guard', u.x + TUNING.DETECT_R * T * 0.95, u.y, { hp: 85, max: 85 });
    advance(s, 0.2);
    expect(s.guards[0]!.alert).toBe(false);
    expect(s.hoard.pool0).toBeLessThan(mkRun({ mod: 'quiet' }).hoard.pool0);
  });
});

describe('v0.3 · abandoning a run costs what dying costs', () => {
  it('the loot stays in the mountain and the crew stays with it', () => {
    const s = mkRun();
    s.guards.length = 0;
    s.loot = 3000;
    // even standing on the exit tiles, walking away is not extracting
    for (const u of s.units) place(u, 2, 17);
    expect(extractReady(s)).toBe(4);

    abandonRun(s);

    expect(s.over).toBe(true);
    const r = s.result!;
    expect(r.success).toBe(false);
    expect(r.loot).toBe(3000); // reported, never banked
    expect(r.survivorsTids).toEqual([]);
    expect(r.crewLostTids.sort()).toEqual([1, 2, 3, 4]);
    expect(r.crewLost).toBe(4);
  });

  it('is a no-op once the run is already over', () => {
    const s = mkRun();
    s.guards.length = 0;
    for (const u of s.units) place(u, 2, 17);
    step(s, { ...idle, commands: [{ c: 'extract' }] });
    const banked = s.result!;
    abandonRun(s);
    expect(s.result).toBe(banked);
    expect(s.result!.success).toBe(true);
  });
});
