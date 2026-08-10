import {
  MODS,
  NAMES,
  T,
  createRun,
  dailySeed,
  modFor,
  type CrewKind,
  type ModDef,
  type ModId,
  type RunMeta,
  type RunState,
  type RunThief,
  type Unit,
} from '../src/headless.js';

export const DATE = '2026-03-14';

export const thief = (tid: number, kind: CrewKind, xp = 0): RunThief => ({
  tid,
  name: NAMES[(tid - 1) % NAMES.length] as string,
  kind,
  xp,
});

/** The prototype's starting hideout, as a run snapshot. */
export function mkMeta(p: Partial<RunMeta> = {}): RunMeta {
  return {
    depth: 1,
    uid: 4,
    crew: [thief(1, 'picklock'), thief(2, 'picklock'), thief(3, 'hexer'), thief(4, 'bruiser')],
    lost: [],
    items: { smoke: 0, lull: 0, trap: 0 },
    up: { dmg: 0, hp: 0, inc: 0 },
    ...p,
  };
}

export interface MkRunOptions {
  depth?: number;
  date?: string;
  meta?: Partial<RunMeta>;
  mod?: ModId;
}

export function mkRun(o: MkRunOptions = {}): RunState {
  const depth = o.depth ?? 1;
  const date = o.date ?? DATE;
  const meta = mkMeta({ depth, ...o.meta });
  const mod: ModDef = o.mod ? (MODS.find((m) => m.id === o.mod) as ModDef) : modFor(date, depth);
  return createRun({ seed: dailySeed(date, depth), depth, mod, meta, date });
}

/** Put a unit on a tile centre and forget whatever path it was walking. */
export function place(u: Unit, tx: number, ty: number): void {
  u.x = tx * T + T / 2;
  u.y = ty * T + T / 2;
  u.px = u.x;
  u.py = u.y;
  u.path = null;
  u.ptile = -1;
}

export function placePx(u: Unit, x: number, y: number): void {
  u.x = x;
  u.y = y;
  u.px = x;
  u.py = y;
  u.path = null;
  u.ptile = -1;
}

/**
 * Isolate a mechanic: one indestructible thief, no guards, full map knowledge.
 * Behavioural checks want to observe a single rule, not a firefight.
 */
export function solo(s: RunState, kind?: CrewKind): Unit {
  if (kind) {
    const u = s.units.find((x) => x.k === kind);
    if (u) s.units = [u];
  }
  s.units.length = 1;
  s.guards.length = 0;
  s.revealed.fill(1);
  const u = s.units[0] as Unit;
  u.hp = 1e6;
  u.max = 1e6;
  return u;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A total fingerprint of a running sim — used for determinism checks. */
export function hashState(s: RunState): string {
  return JSON.stringify({
    ticks: s.ticks,
    loot: r3(s.loot),
    wake: r3(s.wake),
    over: s.over,
    stage: s.stage,
    slain: s.slain,
    guardsSlain: s.guardsSlain,
    pool: r3(s.hoard.pool),
    dragon: [r3(s.dragon.x), r3(s.dragon.y), r3(s.dragon.hp), s.dragon.awake],
    units: s.units.map((u) => [u.tid, r3(u.x), r3(u.y), r3(u.hp), u.face]),
    guards: s.guards.map((g) => [g.k, r3(g.x), r3(g.y), r3(g.hp), g.alert, r3(g.stun)]),
    piles: s.piles.length,
    chests: s.chests.map((c) => [c.open, r3(c.prog)]),
    draws: [s.rngGen.draws, s.rngSim.draws],
    events: s.events.length,
  });
}
