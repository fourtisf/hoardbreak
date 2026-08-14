/**
 * The Grand Vault — the weekly event (v0.4).
 *
 * Every other night the daily modifier is rolled per depth, so two players at
 * two depths are in two different lairs. Once a week — Sunday, UTC — that is
 * overridden: the whole world raids the same fat, well-watched vault. These
 * checks pin when it fires, that it fires for everyone at once, and that a
 * normal night is left exactly as it was.
 */
import { describe, expect, it } from 'vitest';
import {
  GRAND_VAULT,
  MODS,
  createRun,
  dailySeed,
  isGrandVault,
  maxLootFor,
  modFor,
  type RunMeta,
} from '../src/headless.js';

const SUNDAY = '2026-08-16';
const MONDAY = '2026-08-17';
const SATURDAY = '2026-08-15';

const meta = (): RunMeta => ({
  depth: 1,
  uid: 4,
  crew: [{ tid: 1, name: 'Rats', kind: 'picklock', xp: 0 }],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

describe('when the Grand Vault opens', () => {
  it('is a Sunday, in UTC, and only a Sunday', () => {
    expect(isGrandVault(SUNDAY)).toBe(true);
    expect(isGrandVault('2026-08-23')).toBe(true);
    expect(isGrandVault(MONDAY)).toBe(false);
    expect(isGrandVault(SATURDAY)).toBe(false);
  });

  it('is handed to every depth at once — one lair for the whole world', () => {
    for (let depth = 1; depth <= 9; depth++) {
      expect(modFor(SUNDAY, depth).id).toBe('grand');
    }
  });

  it('never comes up on the daily roll of an ordinary night', () => {
    // 400 depths on a non-Sunday, and the event modifier must never appear
    const seen = new Set(Array.from({ length: 400 }, (_, i) => modFor(MONDAY, i + 1).id));
    expect(seen.has('grand')).toBe(false);
    for (const id of seen) expect(MODS.map((m) => m.id)).toContain(id);
  });
});

describe('what it changes about the lair', () => {
  it('is a far richer hoard than the same depth on a plain night', () => {
    const grand = createRun({ seed: dailySeed(SUNDAY, 3), depth: 3, mod: GRAND_VAULT, meta: meta(), date: SUNDAY });
    const plain = createRun({
      seed: dailySeed(MONDAY, 3),
      depth: 3,
      mod: MODS.find((m) => m.id === 'quiet')!,
      meta: meta(),
      date: MONDAY,
    });
    expect(grand.hoard.pool0).toBeGreaterThan(plain.hoard.pool0 * 1.8);
  });

  it('has a loot ceiling that already accounts for its fat hoard', () => {
    // both client and server call modFor, so the ceiling scales with the vault
    // automatically — an honest Grand Vault score is never rejected
    const grand = createRun({ seed: dailySeed(SUNDAY, 3), depth: 3, mod: GRAND_VAULT, meta: meta(), date: SUNDAY });
    expect(maxLootFor(grand)).toBeGreaterThan(grand.hoard.pool0);
  });
});
