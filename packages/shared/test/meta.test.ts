/**
 * Hideout meta — the other half of the acceptance criteria.
 *
 * The engine reports what a run *did*; this is where it lands on the roster and
 * the ledger. Phase 2 moves `applyRunResult` behind `POST /runs/complete`
 * unchanged, so these are the tests that will guard the server transaction.
 */

import { describe, expect, it } from 'vitest';
import {
  LOST_CAP,
  T,
  advance,
  createRun,
  dailySeed,
  extractReady,
  modFor,
  step,
  type RunResult,
  type RunThief,
  type Unit,
} from '@hoardbreak/engine/headless';
import {
  applyRunResult,
  boardRows,
  buyItem,
  buyUpgrade,
  commitRunStart,
  conscript,
  createMeta,
  lootTokens,
  needsConscript,
  recruit,
  rollDay,
  selectDepth,
  unlockedDepth,
} from '../src/index.js';

const DATE = '2026-03-14';

const thief = (tid: number, name: string, kind: RunThief['kind'], xp = 0): RunThief => ({ tid, name, kind, xp });

function result(p: Partial<RunResult> = {}): RunResult {
  return {
    success: true,
    slain: false,
    loot: 0,
    stolenPct: 0,
    guardsSlain: 0,
    crewLost: 0,
    durationMs: 60000,
    crewLostTids: [],
    survivorsTids: [],
    rescuedTid: null,
    rescue: null,
    itemsUsed: { smoke: 0, lull: 0, trap: 0 },
    crewOps: [],
    events: [],
    ...p,
  };
}

describe('a fresh hideout', () => {
  it('starts with 300 gold and the four thieves from the prototype', () => {
    const m = createMeta();
    expect(m.gold).toBe(300);
    expect(m.depth).toBe(1);
    expect(m.uid).toBe(4);
    expect(m.crew.map((t) => t.name)).toEqual(['Rats', 'Wick', 'Sable', 'Fen']);
    expect(m.crew.map((t) => t.kind)).toEqual(['picklock', 'picklock', 'hexer', 'bruiser']);
    expect(m.upCost).toEqual({ dmg: 120, hp: 120, inc: 100 });
  });
});

describe('the black market', () => {
  it('charges for recruits, caps the crew at nine and keeps naming in order', () => {
    const m = createMeta();
    m.gold = 10000;
    expect(recruit(m, 'emberkin').ok).toBe(true);
    expect(m.gold).toBe(10000 - 220);
    expect(m.crew[4]!.name).toBe('Moss');
    while (m.crew.length < 9) recruit(m, 'picklock');
    const full = recruit(m, 'golem');
    expect(full.ok).toBe(false);
    expect(full.msg).toContain('Crew full');
    expect(m.crew).toHaveLength(9);
  });

  it('refuses what you cannot afford', () => {
    const m = createMeta();
    m.gold = 10;
    expect(recruit(m, 'golem')).toEqual({ ok: false, msg: 'Not enough gold' });
    expect(m.crew).toHaveLength(4);
  });

  it('raises upgrade prices by 1.7× a level and caps the incense at three', () => {
    const m = createMeta();
    m.gold = 100000;
    buyUpgrade(m, 'dmg');
    expect(m.up.dmg).toBe(1);
    expect(m.upCost.dmg).toBe(204); // ceil(120 × 1.7)
    buyUpgrade(m, 'dmg');
    expect(m.upCost.dmg).toBe(347); // ceil(204 × 1.7)

    for (let i = 0; i < 5; i++) buyUpgrade(m, 'inc');
    expect(m.up.inc).toBe(3);
    expect(buyUpgrade(m, 'inc').ok).toBe(false);
  });

  it('sells the three consumables at 80 / 120 / 100', () => {
    const m = createMeta();
    m.gold = 1000;
    buyItem(m, 'smoke');
    buyItem(m, 'lull');
    buyItem(m, 'trap');
    expect(m.items).toEqual({ smoke: 1, lull: 1, trap: 1 });
    expect(m.gold).toBe(1000 - 300);
  });
});

describe('$LOOT', () => {
  it('pays out exactly the §9 formula', () => {
    expect(lootTokens({ depth: 1, stolenPct: 0, slain: false, guardsSlain: 0 })).toBe(3);
    expect(lootTokens({ depth: 4, stolenPct: 60, slain: false, guardsSlain: 0 })).toBe(20);
    expect(lootTokens({ depth: 4, stolenPct: 59, slain: false, guardsSlain: 0 })).toBe(12);
    expect(lootTokens({ depth: 3, stolenPct: 100, slain: true, guardsSlain: 7 })).toBe(9 + 6 + 12 + 2);
  });
});

describe('applying a successful run', () => {
  it('banks the gold, levels the survivors and pushes you deeper', () => {
    const m = createMeta();
    const payout = applyRunResult(
      m,
      result({ loot: 2340, stolenPct: 72, guardsSlain: 9, survivorsTids: [1, 2, 3, 4] }),
    );

    expect(m.gold).toBe(300 + 2340);
    expect(m.todayBest).toBe(2340);
    expect(m.crew.every((t) => t.xp === 1)).toBe(true);
    expect(m.depth).toBe(2);
    expect(m.best).toBe(1);
    expect(payout.depthPlayed).toBe(1);
    expect(payout.tok).toBe(1 * 3 + 1 * 2 + Math.floor(9 / 3));
    expect(m.tok).toBe(payout.tok);
  });

  it('sends anyone left behind to a dragon prison', () => {
    const m = createMeta();
    applyRunResult(m, result({ loot: 500, survivorsTids: [1, 2], crewOps: [{ op: 'lose', tid: 4 }] }));
    expect(m.crew.map((t) => t.tid)).toEqual([1, 2, 3]);
    expect(m.lost.map((t) => t.name)).toEqual(['Fen']);
  });

  it('takes a rescued friend back — or pays them off when the crew is full', () => {
    const freed = thief(9, 'Vex', 'hexer', 2);

    const roomy = createMeta();
    roomy.lost.push(freed);
    const back = applyRunResult(
      roomy,
      result({ rescuedTid: 9, rescue: { thief: freed, fromQueue: true, extracted: true }, crewOps: [{ op: 'freeFromQueue', tid: 9 }] }),
    );
    expect(roomy.lost).toHaveLength(0);
    expect(roomy.crew.map((t) => t.tid)).toContain(9);
    expect(back.notes[0]!.msg).toContain('joins the crew');

    const full = createMeta();
    full.gold = 0;
    while (full.crew.length < 9) full.crew.push(thief(100 + full.crew.length, `Extra${full.crew.length}`, 'picklock'));
    full.lost.push(freed);
    const paid = applyRunResult(
      full,
      result({ rescuedTid: 9, rescue: { thief: freed, fromQueue: true, extracted: true }, crewOps: [{ op: 'freeFromQueue', tid: 9 }] }),
    );
    expect(full.crew).toHaveLength(9);
    expect(full.gold).toBe(150);
    expect(paid.notes[0]!.msg).toContain('150g');
  });

  it('leaves a rescued thief who never reached the exit behind for good', () => {
    const m = createMeta();
    const freed = thief(9, 'Vex', 'hexer');
    m.lost.push(freed);
    applyRunResult(
      m,
      result({ rescue: { thief: freed, fromQueue: true, extracted: false }, crewOps: [{ op: 'freeFromQueue', tid: 9 }] }),
    );
    expect(m.lost).toHaveLength(0);
    expect(m.crew.map((t) => t.tid)).not.toContain(9);
  });

  it('spends only the consumables that were actually used', () => {
    const m = createMeta();
    m.items = { smoke: 3, lull: 1, trap: 2 };
    applyRunResult(m, result({ loot: 100, itemsUsed: { smoke: 2, lull: 0, trap: 1 } }));
    expect(m.items).toEqual({ smoke: 1, lull: 1, trap: 1 });
  });
});

describe('applying a failed run', () => {
  it('keeps the hideout gold and fills the lost queue, respecting its cap of six', () => {
    const m = createMeta();
    m.gold = 900;
    for (let i = 0; i < 5; i++) m.lost.push(thief(50 + i, `L${i}`, 'picklock'));

    applyRunResult(
      m,
      result({
        success: false,
        loot: 4000,
        crewLost: 4,
        crewOps: [
          { op: 'lose', tid: 4 },
          { op: 'lose', tid: 3 },
          { op: 'lose', tid: 2 },
          { op: 'lose', tid: 1 },
        ],
      }),
    );

    expect(m.gold).toBe(900); // the deep keeps the loot
    expect(m.depth).toBe(1); // no progress
    expect(m.tok).toBe(0);
    expect(m.crew).toHaveLength(0);
    expect(m.lost).toHaveLength(LOST_CAP);
    expect(m.lost.map((t) => t.tid).slice(5)).toEqual([4]); // only one more fit
  });

  it('frees a queue slot before a later death claims it', () => {
    const m = createMeta();
    const freed = thief(9, 'Vex', 'hexer');
    m.lost = [freed];
    for (let i = 0; i < 5; i++) m.lost.push(thief(50 + i, `L${i}`, 'picklock'));
    expect(m.lost).toHaveLength(LOST_CAP);

    applyRunResult(
      m,
      result({
        success: false,
        crewOps: [
          { op: 'freeFromQueue', tid: 9 },
          { op: 'lose', tid: 1 },
        ],
      }),
    );

    expect(m.lost.map((t) => t.tid)).toEqual([50, 51, 52, 53, 54, 1]);
  });
});

describe('run start', () => {
  it('a generated prisoner reserves a thief id so recruit names never collide', () => {
    const m = createMeta();
    const run = createRun({
      seed: dailySeed(DATE, 3),
      depth: 3,
      mod: modFor(DATE, 3),
      meta: m,
      date: DATE,
    });
    expect(run.prison).not.toBeNull();
    expect(run.freshPrisonerTid).toBe(5);

    commitRunStart(m, run);
    m.gold = 1000;
    recruit(m, 'picklock');
    expect(m.crew.at(-1)!.tid).toBe(6);
    expect(m.crew.at(-1)!.name).not.toBe(run.prison!.thief.name);
  });
});

describe('end to end', () => {
  it('a real extraction moves gold, XP and depth exactly once', () => {
    const m = createMeta();
    const run = createRun({
      seed: dailySeed(DATE, 1),
      depth: 1,
      mod: modFor(DATE, 1),
      meta: m,
      date: DATE,
    });
    commitRunStart(m, run);

    // siphon for two seconds, then walk everyone onto the green tiles
    run.guards.length = 0;
    for (const u of run.units) {
      u.hp = 1e6;
      u.max = 1e6;
      u.x = 27 * T + T / 2;
      u.y = 5 * T + T / 2;
      u.px = u.x;
      u.py = u.y;
    }
    advance(run, 2);
    const siphoned = run.loot;
    expect(siphoned).toBeGreaterThan(0);

    for (const u of run.units as Unit[]) {
      u.x = 2 * T + T / 2;
      u.y = 17 * T + T / 2;
      u.px = u.x;
      u.py = u.y;
      u.path = null;
      u.ptile = -1;
    }
    expect(extractReady(run)).toBe(4);
    step(run, { mx: 0, my: 0, mm: 0, commands: [{ c: 'extract' }] });

    const payout = applyRunResult(m, run.result!);
    expect(m.gold).toBe(300 + run.result!.loot);
    expect(m.depth).toBe(2);
    expect(m.crew.every((t) => t.xp === 1)).toBe(true);
    expect(payout.tok).toBeGreaterThan(0);
    expect(m.todayBest).toBe(run.result!.loot);
  });
});

/* ============================================================ *
 * v0.3 — depth choice, per-depth boards and the safety net
 * ============================================================ */

describe('v0.3 · choosing tonight’s depth', () => {
  it('starts locked to depth 1 and unlocks one deeper per clear', () => {
    const m = createMeta();
    expect(unlockedDepth(m)).toBe(1);
    expect(selectDepth(m, 5)).toBe(1); // cannot skip ahead

    applyRunResult(m, result({ loot: 900, survivorsTids: [1, 2, 3, 4] }));
    expect(m.best).toBe(1);
    expect(unlockedDepth(m)).toBe(2);
    expect(m.depth).toBe(2);
  });

  it('lets you drop back down to a depth you have already cleared', () => {
    const m = createMeta();
    m.best = 6;
    expect(unlockedDepth(m)).toBe(7);
    expect(selectDepth(m, 3)).toBe(3);
    expect(selectDepth(m, 0)).toBe(1);
    expect(selectDepth(m, 99)).toBe(7);
  });

  it('replaying an easier depth does not fling you back to the deep end', () => {
    const m = createMeta();
    m.best = 6;
    selectDepth(m, 2);
    applyRunResult(m, result({ loot: 500, survivorsTids: [1] }));
    expect(m.best).toBe(6); // no progress lost
    expect(m.depth).toBe(3); // one step on from where you actually played
  });

  it('tracks a personal best per depth, today and all time', () => {
    const m = createMeta('2026-03-14');
    m.best = 3;
    selectDepth(m, 2);
    applyRunResult(m, result({ loot: 1500, survivorsTids: [1] }));
    selectDepth(m, 2);
    applyRunResult(m, result({ loot: 900, survivorsTids: [1] }));
    expect(m.bestByDepth[2]).toBe(1500);
    expect(m.todayBestByDepth[2]).toBe(1500);
    expect(m.todayBest).toBe(1500);
  });

  it('wipes the today-scoped counters at UTC midnight, keeping all-time bests', () => {
    const m = createMeta('2026-03-14');
    m.best = 2;
    applyRunResult(m, result({ loot: 2000, survivorsTids: [1] }));
    expect(m.todayBest).toBe(2000);

    expect(rollDay(m, '2026-03-14')).toBe(false);
    expect(rollDay(m, '2026-03-15')).toBe(true);
    expect(m.todayBest).toBe(0);
    expect(m.todayBestByDepth).toEqual({});
    expect(m.bestByDepth[1]).toBe(2000); // all-time survives the rollover
    expect(m.gold).toBe(300 + 2000);
  });
});

describe('v0.3 · the board ranks within a depth', () => {
  it('is deterministic per day and depth, and deeper boards score higher', () => {
    const a = boardRows('2026-03-14', 3, 0);
    expect(boardRows('2026-03-14', 3, 0)).toEqual(a);
    expect(boardRows('2026-03-14', 4, 0)).not.toEqual(a);

    const shallow = boardRows('2026-03-14', 1, 0).filter((r) => !r.you);
    const deep = boardRows('2026-03-14', 6, 0).filter((r) => !r.you);
    const top = (rows: typeof shallow): number => Math.max(...rows.map((r) => r.s));
    expect(top(deep)).toBeGreaterThan(top(shallow));
  });

  it('puts you on the board and sorts you into place', () => {
    const rows = boardRows('2026-03-14', 1, 999999);
    expect(rows[0]!.you).toBe(true);
    expect(rows).toHaveLength(5);
  });
});

describe('v0.3 · no dead saves', () => {
  it('a wiped crew with no gold can always get a body back, free', () => {
    const m = createMeta();
    m.crew.length = 0;
    m.gold = 12;
    expect(needsConscript(m)).toBe(true);

    const r = conscript(m);
    expect(r.ok).toBe(true);
    expect(m.crew).toHaveLength(1);
    expect(m.gold).toBe(12); // free, as promised
    expect(needsConscript(m)).toBe(false);
  });

  it('cannot be farmed — you have to have lost everyone first', () => {
    const m = createMeta();
    expect(conscript(m).ok).toBe(false);
    expect(m.crew).toHaveLength(4);
    m.gold = 5000;
    m.crew.length = 0;
    expect(needsConscript(m)).toBe(false); // rich enough to hire properly
  });
});
