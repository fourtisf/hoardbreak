/**
 * The verdict the hideout shows must match what the lair actually does.
 *
 * `packages/engine/test/balance.test.ts` measures the real fight; this pins the
 * advice given about it. If they ever disagree, the game is lying to a player
 * about whether four named people are about to die — which is the one thing
 * this screen exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import { TUNING, UD } from '@dragonjob/engine/headless';
import { createMeta, markPlayed, newThief, type Meta } from '../src/meta.js';
import { crewDps, dragonHpAt, glassCount, huntLines, slayerReadiness } from '../src/slayer.js';

const withCrew = (kinds: Parameters<typeof newThief>[1][], xp = 0): Meta => {
  const m = createMeta('2026-08-11');
  m.crew = [];
  for (const k of kinds) m.crew.push({ ...newThief(m, k), xp });
  return m;
};

describe('slayer readiness', () => {
  it('tells a starting crew, in as many words, not to fight it', () => {
    const m = createMeta('2026-08-11'); // the four everyone begins with
    const r = slayerReadiness(m, 1);
    expect(r.grade).toBe('flee');
    expect(r.line).toMatch(/cannot kill it yet/i);
    // and the balance test proves that advice: they deal 15% and lose everyone
    expect(r.ttk).toBeGreaterThan(30);
  });

  it('names how much stronger they would have to be, not just "no"', () => {
    const r = slayerReadiness(createMeta('2026-08-11'), 1);
    expect(r.line).toMatch(/\d+(\.\d+)?× the damage/);
  });

  it('clears a full levelled roster, matching the measured kill', () => {
    const m = withCrew(
      ['bruiser', 'bruiser', 'golem', 'golem', 'emberkin', 'emberkin', 'emberkin', 'hexer', 'hexer'],
      TUNING.LEVEL_CAP,
    );
    const r = slayerReadiness(m, 1);
    expect(r.grade).toBe('ready');
    expect(r.ttk).toBeLessThanOrEqual(14);
  });

  it('counts the crew a single breath would erase', () => {
    const m = withCrew(['picklock', 'picklock', 'hexer', 'bruiser']);
    expect(glassCount(m)).toBe(3);
    expect(UD.bruiser.hp).toBeGreaterThan(TUNING.AWAKE_BREATH_DMG);
  });

  it('counts bought damage, so the shop visibly moves the verdict', () => {
    const m = withCrew(['bruiser', 'bruiser']);
    const before = crewDps(m);
    m.up.dmg = 6;
    expect(crewDps(m)).toBeGreaterThan(before);
  });

  it('scales the wyrm with depth, so the same crew is told different things', () => {
    expect(dragonHpAt(8)).toBeGreaterThan(dragonHpAt(1));
    const m = withCrew(['bruiser', 'bruiser', 'golem', 'golem', 'emberkin', 'emberkin', 'emberkin'], TUNING.LEVEL_CAP);
    expect(slayerReadiness(m, 1).ttk).toBeLessThan(slayerReadiness(m, 8).ttk);
  });
});

describe('the daily streak', () => {
  it('counts the run, not the win — a wipe still keeps it alive', () => {
    const m = createMeta('2026-08-10');
    expect(markPlayed(m, '2026-08-10')).toBe(1);
    expect(markPlayed(m, '2026-08-11')).toBe(2);
    expect(markPlayed(m, '2026-08-12')).toBe(3);
  });

  it('does not double-count two runs on the same day', () => {
    const m = createMeta('2026-08-10');
    markPlayed(m, '2026-08-10');
    expect(markPlayed(m, '2026-08-10')).toBe(1);
  });

  it('breaks on a missed day but leaves the record standing', () => {
    const m = createMeta('2026-08-10');
    markPlayed(m, '2026-08-10');
    markPlayed(m, '2026-08-11');
    markPlayed(m, '2026-08-12');
    expect(m.bestStreak).toBe(3);
    expect(markPlayed(m, '2026-08-14')).toBe(1); // skipped the 13th
    expect(m.bestStreak).toBe(3);
  });

  it('crosses a month boundary', () => {
    const m = createMeta('2026-08-31');
    markPlayed(m, '2026-08-31');
    expect(markPlayed(m, '2026-09-01')).toBe(2);
  });
});

/**
 * What the game says when the wyrm is up.
 *
 * The bug this pins: three separate places told the player to run the moment it
 * opened its eyes, while the wyrm's own panel said their crew could kill it. Two
 * opposite instructions at once read as "the fight is never allowed", so players
 * stopped believing the dragon could be fought at all.
 */
describe('what it says when the wyrm hunts', () => {
  it('tells a crew that can win that it can win — on every line, not just one', () => {
    const l = huntLines('ready');
    expect(l.strip).toMatch(/can be killed/);
    expect(l.hint).toMatch(/can kill it/);
    expect(l.wake).toMatch(/can be killed/);
    // and never orders them out
    expect(`${l.strip} ${l.hint} ${l.wake}`).not.toMatch(/EXTRACT|exit tiles/);
  });

  it('tells a crew that cannot win to leave — on every line', () => {
    const l = huntLines('flee');
    expect(l.strip).toMatch(/EXTRACT/);
    expect(l.hint).toMatch(/exit tiles/);
    expect(l.wake).toMatch(/exit tiles/);
    expect(`${l.strip} ${l.hint} ${l.wake}`).not.toMatch(/can be killed|can kill it/);
  });

  it('leaves the middle case genuinely open, and says so both ways', () => {
    const l = huntLines('risky');
    expect(l.hint).toMatch(/fight/);
    expect(l.hint).toMatch(/exit/);
  });

  it('says something different for each verdict — a line that never changes teaches nothing', () => {
    const strips = (['flee', 'risky', 'ready'] as const).map((g) => huntLines(g).strip);
    expect(new Set(strips).size).toBe(3);
  });

  it('matches the verdict a real starting crew gets', () => {
    // the four everyone begins with, at depth 1: the engine's balance test
    // measures that fight as unwinnable, so the copy has to send them home
    const r = slayerReadiness(createMeta('2026-08-11'), 1);
    expect(r.grade).toBe('flee');
    expect(huntLines(r.grade).hint).toMatch(/Not with this crew/);
  });

  it('matches the verdict a full, levelled crew gets', () => {
    // nine levelled bodies: the same balance test measures them killing it
    const r = slayerReadiness(
      withCrew(['golem', 'emberkin', 'emberkin', 'golem', 'emberkin', 'bruiser', 'emberkin', 'golem', 'emberkin'], 40),
      1,
    );
    expect(r.grade).not.toBe('flee');
    expect(huntLines(r.grade).hint).not.toMatch(/Not with this crew/);
  });
});
