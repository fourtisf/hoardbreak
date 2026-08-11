/**
 * The card is the game's only growth engine until the board is real, so its
 * shape is pinned: a stranger scrolling past must be able to read it, and two
 * players who raided the same lair must be able to compare it line for line.
 */
import { describe, expect, it } from 'vitest';
import type { RunResult } from '@dragonjob/engine/headless';
import { shareText, wakeBar } from '../src/share.js';
import { exportSave, importSave } from '../src/savecode.js';
import { createMeta, markPlayed } from '../src/meta.js';

const run = (over: Partial<RunResult> = {}): RunResult => ({
  success: true,
  slain: false,
  loot: 8140,
  stolenPct: 71,
  guardsSlain: 3,
  crewLost: 2,
  wake: 78,
  durationMs: 240_000,
  crewLostTids: [1, 3],
  survivorsTids: [2, 4],
  rescuedTid: null,
  rescue: null,
  itemsUsed: { smoke: 0, lull: 0, trap: 0 },
  everSpotted: true,
  crewOps: [],
  events: [],
  ...over,
});

const card = (over: Partial<RunResult> = {}, extra: Partial<Parameters<typeof shareText>[0]> = {}): string =>
  shareText({
    date: '2026-08-11',
    depth: 6,
    mod: 'A HUNGRY WYRM',
    result: run(over),
    crewIn: 4,
    lostNames: ['Sable', 'Rats'],
    streak: 3,
    ...extra,
  });

describe('the share card', () => {
  it('draws the wake meter proportionally, and pins both ends', () => {
    expect(wakeBar(0)).toBe('░░░░░░░░░░');
    expect(wakeBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓');
    expect(wakeBar(50)).toBe('▓▓▓▓▓░░░░░');
    expect(wakeBar(78)).toBe('▓▓▓▓▓▓▓▓░░');
  });

  it('clamps a wake outside 0–100 rather than drawing a broken bar', () => {
    expect(wakeBar(-20)).toBe('░░░░░░░░░░');
    expect(wakeBar(140)).toBe('▓▓▓▓▓▓▓▓▓▓');
  });

  it('carries the day, the lair and what it cost', () => {
    const t = card();
    expect(t).toContain('2026-08-11');
    expect(t).toContain('Depth 6 · A HUNGRY WYRM');
    expect(t).toContain('8,140g');
    expect(t).toContain('71% of the hoard');
    expect(t).toContain('4 in · 2 out');
    expect(t).toContain('Left behind: Sable, Rats');
    expect(t).toContain('3-day streak');
    expect(t).toContain('thedragonjob.com');
  });

  it('leads with the kill when there is one', () => {
    expect(card({ slain: true })).toContain('THE WYRM IS DEAD');
  });

  it('says so plainly when nobody came back', () => {
    expect(card({ success: false })).toMatch(/nobody came back/i);
  });

  it('calls out a clean run nobody ever saw', () => {
    const t = card({ everSpotted: false }, { lostNames: [], crewIn: 4 });
    expect(t).toContain('Never seen');
  });

  it('stays short enough to post — under 280 characters', () => {
    expect([...card()].length).toBeLessThan(280);
    expect([...card({ slain: true })].length).toBeLessThan(280);
  });

  it('drops the streak line on day one rather than bragging about a 1', () => {
    expect(card({}, { streak: 1 })).not.toContain('streak');
  });
});

describe('save codes', () => {
  it('round-trips a hideout', () => {
    const m = createMeta('2026-08-11');
    m.gold = 4321;
    m.best = 5;
    markPlayed(m, '2026-08-11');
    const r = importSave(exportSave(m));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.gold).toBe(4321);
    expect(r.meta.best).toBe(5);
    expect(r.meta.streak).toBe(1);
    expect(r.meta.crew).toHaveLength(m.crew.length);
  });

  it('survives the whitespace a paste picks up', () => {
    const code = exportSave(createMeta('2026-08-11'));
    expect(importSave(`  ${code.slice(0, 20)}\n${code.slice(20)}  `).ok).toBe(true);
  });

  it('refuses a truncated code instead of loading half a hideout', () => {
    const code = exportSave(createMeta('2026-08-11'));
    const r = importSave(code.slice(0, code.length - 8));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.msg).toMatch(/damaged|cut short/i);
  });

  it('tells someone who pasted the wrong thing what a code looks like', () => {
    const r = importSave('hello world');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.msg).toContain('DJ1-');
  });

  it('fills in fields a code from an older build never had', () => {
    const old = JSON.stringify({ gold: 99, crew: [] });
    // hand-rolled to look like a v1 code with only two fields
    const code = exportSave({ ...createMeta(), ...JSON.parse(old) });
    const r = importSave(code);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.upCost).toBeDefined();
    expect(r.meta.streak).toBe(0);
  });
});
