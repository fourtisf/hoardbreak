/**
 * Port ↔ prototype parity.
 *
 * The fixture in `prototype-lairs.fixture.json` was captured by driving the
 * real `HOARDBREAK_v0.2.html` in a browser with its rAF loop frozen, so every
 * lair is read at t = 0 before anything has moved. Regenerate it with
 * `node test/capture-prototype.mjs` (see that file for the how and why).
 *
 * This is the check that answers Phase 1's acceptance question — "plays
 * identically to the prototype" — at the only place it can be answered
 * objectively: the generated world.
 */

import { describe, expect, it } from 'vitest';
import { createRun, dailySeed, modFor, snapshotJSON, type RunMeta } from '../src/headless.js';
import proto from './prototype-lairs.fixture.json';

const meta = (depth: number): RunMeta => ({
  depth, uid: 4,
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

describe('port ↔ prototype parity', () => {
  for (const [k, v] of Object.entries(proto.depths as Record<string, any>)) {
    const depth = Number(k);
    it(`depth ${depth} generates the identical lair`, () => {
      const s = createRun({
        seed: dailySeed(proto.day, depth), depth, mod: modFor(proto.day, depth),
        meta: meta(depth), date: proto.day,
      });
      expect(snapshotJSON(s)).toBe(v.snap);
      expect(s.mod.id).toBe(v.mod);
      expect(s.hoard.pool0).toBe(v.pool0);
      expect(s.dragon.max).toBe(v.dragonMax);
      expect(s.exitTiles.length).toBe(v.exitTiles);
      expect(s.shrine ? [s.shrine.x, s.shrine.y] : null).toEqual(v.shrine);
      expect(s.armory ? [s.armory.x, s.armory.y] : null).toEqual(v.armory);
      expect(s.prison ? [s.prison.fromQ, s.prison.thief.name, s.prison.thief.kind] : null).toEqual(v.prison);
      expect(s.freshPrisonerTid === null ? 4 : Math.max(4, s.freshPrisonerTid)).toBe(v.uidAfter);
      expect(s.units.map((u) => [u.tid, u.x, u.y, Math.round(u.max * 1000) / 1000])).toEqual(v.units);
    });
  }
});
