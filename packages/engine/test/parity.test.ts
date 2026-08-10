/**
 * Port ↔ prototype parity.
 *
 * The fixture in `prototype-lairs.fixture.json` was captured by driving the
 * real `HOARDBREAK_v0.2.html` in a browser with its rAF loop frozen, so every
 * lair is read at t = 0 before anything has moved. Regenerate it with
 * `node test/capture-prototype.mjs` (see that file for the how and why).
 *
 * WHAT THIS GUARANTEES, FOREVER: given the same modifier, this engine's lair
 * generator is byte-identical to the prototype's. That is the anti-cheat
 * backbone — the server regenerates a lair from (date, depth) to bound a
 * submitted score (handoff §6 tier 2), so any drift here is a live exploit.
 *
 * WHAT IT DELIBERATELY DOES NOT PIN: which modifier a given day rolls, and
 * where the crew stands when the doors open. Both changed in v0.3, on purpose:
 * the modifier table grew from five nights to eight, and the crew no longer
 * spawns inside the extraction zone. Those divergences are asserted directly in
 * `behaviour.test.ts` (see "v0.3 design changes") rather than smuggled in here,
 * so nobody can weaken this file by editing a fixture.
 */

import { describe, expect, it } from 'vitest';
import { MODS, createRun, dailySeed, snapshotJSON, type ModDef, type RunMeta } from '../src/headless.js';
import proto from './prototype-lairs.fixture.json';

const meta = (depth: number): RunMeta => ({
  depth,
  uid: 4,
  crew: [
    { tid: 1, name: 'Rats', kind: 'picklock', xp: 0 },
    { tid: 2, name: 'Wick', kind: 'picklock', xp: 0 },
    { tid: 3, name: 'Sable', kind: 'hexer', xp: 0 },
    { tid: 4, name: 'Fen', kind: 'bruiser', xp: 0 },
  ],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
});

interface Captured {
  snap: string;
  mod: string;
  pool0: number;
  dragonMax: number;
  exitTiles: number;
  prison: [boolean, string, string] | null;
  shrine: [number, number] | null;
  armory: [number, number] | null;
  uidAfter: number;
  units: [number, number, number, number][];
}

describe('port ↔ prototype parity', () => {
  for (const [k, captured] of Object.entries(proto.depths as unknown as Record<string, Captured>)) {
    const depth = Number(k);

    it(`depth ${depth} generates the identical lair`, () => {
      // pin the modifier the prototype actually rolled: this test is about the
      // generator, not about which night the calendar picks
      const mod = MODS.find((m) => m.id === captured.mod) as ModDef;
      expect(mod).toBeDefined();

      const s = createRun({
        seed: dailySeed(proto.day, depth),
        depth,
        mod,
        meta: meta(depth),
        date: proto.day,
      });

      expect(snapshotJSON(s)).toBe(captured.snap);
      expect(s.hoard.pool0).toBe(captured.pool0);
      expect(s.dragon.max).toBe(captured.dragonMax);
      expect(s.exitTiles.length).toBe(captured.exitTiles);
      expect(s.shrine ? [s.shrine.x, s.shrine.y] : null).toEqual(captured.shrine);
      expect(s.armory ? [s.armory.x, s.armory.y] : null).toEqual(captured.armory);
      expect(s.prison ? [s.prison.fromQ, s.prison.thief.name, s.prison.thief.kind] : null).toEqual(
        captured.prison,
      );
      expect(s.freshPrisonerTid === null ? 4 : Math.max(4, s.freshPrisonerTid)).toBe(captured.uidAfter);
    });

    it(`depth ${depth} gives every thief the prototype's stat line`, () => {
      const mod = MODS.find((m) => m.id === captured.mod) as ModDef;
      const s = createRun({ seed: dailySeed(proto.day, depth), depth, mod, meta: meta(depth), date: proto.day });
      // ids and max HP are unchanged; only the spawn column moved in v0.3
      expect(s.units.map((u) => [u.tid, Math.round(u.max * 1000) / 1000])).toEqual(
        captured.units.map((u) => [u[0], u[3]]),
      );
    });
  }

  it('the five original modifiers still describe the same nights', () => {
    // v0.3 added three more; it must not have edited the five that shipped
    const original = {
      dark: { rev: 2.4 },
      restless: { wakeMul: 1.25, hoardMul: 1.5 },
      garrison: { extraG: 2, gHp: 1.2, chestMul: 1.4 },
      gilded: { pileMul: 1.6, alertAdd: 1 },
      quiet: {},
    };
    for (const [id, fields] of Object.entries(original)) {
      const m = MODS.find((x) => x.id === id) as ModDef;
      expect(m).toBeDefined();
      for (const [key, value] of Object.entries(fields)) {
        expect(m[key as keyof ModDef]).toBe(value);
      }
    }
  });
});
