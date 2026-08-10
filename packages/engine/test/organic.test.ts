/**
 * Headless organic playthroughs.
 *
 * The prototype was signed off with "headless organic playthroughs clean" on
 * top of the 20 checks: a scripted thief actually raids the lair, fights what
 * it meets, siphons and runs for the door. These catch the whole-run failures
 * that isolated checks miss — a crew that deadlocks on a path, a run that never
 * terminates, an honest score that somehow beats the server's loot ceiling.
 */

import { describe, expect, it } from 'vitest';
import {
  T,
  TC,
  TR,
  advance,
  clamp,
  extractReady,
  maxLootFor,
  step,
  type RunCommand,
  type RunState,
} from '../src/headless.js';
import { mkRun } from './helpers.js';

/** A greedy little bot: run for the gold, siphon, then run for the door. */
function playthrough(s: RunState, maxSeconds = 240): RunState {
  let tick = 0;
  while (!s.over && s.t < maxSeconds) {
    const commands: RunCommand[] = [];
    const leaving = s.dragon.awake || s.wake >= 78 || s.hoard.pool <= s.hoard.pool0 * 0.2;
    const tx = leaving ? s.exitCtr.x : (s.hoard.x0 + 1) * T + T / 2;
    const ty = leaving ? s.exitCtr.y : (s.hoard.y0 + 1) * T + T / 2;
    if (tick % 24 === 0) {
      commands.push({
        c: 'move',
        x: clamp((tx / T) | 0, 0, TC - 1),
        y: clamp((ty / T) | 0, 0, TR - 1),
      });
    }
    if (leaving && extractReady(s) > 0) commands.push({ c: 'extract' });
    step(s, { mx: 0, my: 0, mm: 0, commands });
    tick++;
  }
  return s;
}

describe('organic playthroughs', () => {
  it('a bot can raid, siphon and extract from every lair it is given', () => {
    let extractions = 0;
    for (const date of ['2026-03-14', '2026-06-01']) {
      for (let depth = 1; depth <= 4; depth++) {
        const s = mkRun({ date, depth, meta: { items: { smoke: 1, lull: 1, trap: 1 } } });
        const ceiling = maxLootFor(s);
        playthrough(s);

        expect(s.over).toBe(true);
        const r = s.result!;
        expect(r.loot).toBeGreaterThan(0);
        expect(r.loot).toBeLessThanOrEqual(ceiling);
        expect(r.stolenPct).toBeGreaterThanOrEqual(0);
        expect(r.stolenPct).toBeLessThanOrEqual(100);
        expect(r.durationMs).toBe(Math.round(s.t * 1000));
        expect(r.survivorsTids.length + r.crewLostTids.length).toBeLessThanOrEqual(4);
        // the loot ledger has to add up to what the run says it earned (§6 tier 4)
        const banked = r.events
          .filter((e) => e[1] === 'LOOT_PILE' || e[1] === 'CHEST' || e[1] === 'SIPHON_TICK' || e[1] === 'GUARD_KILL')
          .reduce((a, e) => a + e[2], 0);
        expect(Math.abs(banked - r.loot)).toBeLessThan(Math.max(20, r.loot * 0.02));
        if (r.success) extractions++;
      }
    }
    expect(extractions).toBeGreaterThan(0);
  });

  it('a run left completely alone still resolves — the wyrm always wins eventually', () => {
    const s = mkRun({ depth: 2 });
    advance(s, 600);
    // passive noise alone crosses 50%, and a crew that never moves is exactly
    // where the sleeping breath lands
    expect(s.stage).toBeGreaterThanOrEqual(1);
    expect(s.over).toBe(true);
    expect(s.result!.success).toBe(false);
    expect(s.result!.crewLostTids).toHaveLength(4);
  });

  it('the sim never leaves an entity off the board', () => {
    const s = mkRun({ depth: 5, meta: { items: { smoke: 2, lull: 2, trap: 2 } } });
    playthrough(s, 120);
    for (const u of s.units) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(u.x).toBeGreaterThanOrEqual(0);
      expect(u.x).toBeLessThanOrEqual(TC * T);
      expect(u.y).toBeGreaterThanOrEqual(0);
      expect(u.y).toBeLessThanOrEqual(TR * T);
      expect(u.hp).toBeGreaterThan(0);
    }
    for (const g of s.guards) {
      expect(Number.isFinite(g.x)).toBe(true);
      expect(g.hp).toBeGreaterThan(0);
    }
    expect(s.hoard.pool).toBeGreaterThanOrEqual(0);
    expect(s.wake).toBeLessThanOrEqual(100);
  });
});
