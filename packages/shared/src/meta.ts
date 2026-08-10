/**
 * Hideout meta — roster, gold, upgrades, and how a finished run changes them.
 *
 * Phase 1 keeps a `Meta` in memory on the client. Phase 2 moves the same shape
 * server-side (handoff §6–7) and `applyRunResult` becomes the transaction that
 * `POST /runs/complete` runs. The rules live here, in one place, precisely so
 * that move is a relocation and not a rewrite.
 */

import {
  CREW_CAP,
  ITEM_KEYS,
  ITEMS,
  LOST_CAP,
  NAMES,
  STARTING_CREW,
  UD,
  UPGRADES,
  UPGRADE_COST_MUL,
  type CrewKind,
  type FeedLine,
  type ItemKey,
  type RunMeta,
  type RunResult,
  type RunThief,
  type UpgradeKey,
} from '@hoardbreak/engine/headless';

export interface Meta {
  gold: number;
  /** $LOOT balance (Phase 3 moves this to the ledger) */
  tok: number;
  depth: number;
  /** best depth cleared */
  best: number;
  /** last allocated thief id */
  uid: number;
  /** biggest single heist today */
  todayBest: number;
  crew: RunThief[];
  lost: RunThief[];
  items: Record<ItemKey, number>;
  up: Record<UpgradeKey, number>;
  upCost: Record<UpgradeKey, number>;
}

export function newThief(meta: Meta, kind: CrewKind): RunThief {
  meta.uid++;
  return { tid: meta.uid, name: NAMES[(meta.uid - 1) % NAMES.length] as string, kind, xp: 0 };
}

/** A brand new hideout: 300 gold and four names you will get attached to. */
export function createMeta(): Meta {
  const meta: Meta = {
    gold: 300,
    tok: 0,
    depth: 1,
    best: 0,
    uid: 0,
    todayBest: 0,
    crew: [],
    lost: [],
    items: { smoke: 0, lull: 0, trap: 0 },
    up: { dmg: 0, hp: 0, inc: 0 },
    upCost: { dmg: UPGRADES.dmg.base, hp: UPGRADES.hp.base, inc: UPGRADES.inc.base },
  };
  for (const k of STARTING_CREW) meta.crew.push(newThief(meta, k));
  return meta;
}

/* ---------------- camp actions (server-enforced from Phase 2) ---------------- */

export interface ShopResult {
  ok: boolean;
  msg: string;
}

export function recruit(meta: Meta, kind: CrewKind): ShopResult {
  const d = UD[kind];
  if (meta.crew.length >= CREW_CAP) return { ok: false, msg: `Crew full — ${CREW_CAP} thieves max` };
  if (meta.gold < d.cost) return { ok: false, msg: 'Not enough gold' };
  meta.gold -= d.cost;
  const th = newThief(meta, kind);
  meta.crew.push(th);
  return { ok: true, msg: `${th.name} the ${d.n} joins the crew` };
}

export function canBuyUpgrade(meta: Meta, key: UpgradeKey): boolean {
  return meta.gold >= meta.upCost[key] && meta.up[key] < UPGRADES[key].max;
}

export function buyUpgrade(meta: Meta, key: UpgradeKey): ShopResult {
  if (meta.up[key] >= UPGRADES[key].max) return { ok: false, msg: 'Already maxed' };
  if (meta.gold < meta.upCost[key]) return { ok: false, msg: 'Not enough gold' };
  meta.gold -= meta.upCost[key];
  meta.up[key]++;
  meta.upCost[key] = Math.ceil(meta.upCost[key] * UPGRADE_COST_MUL);
  return { ok: true, msg: `${UPGRADES[key].n} Lv.${meta.up[key]}` };
}

export function buyItem(meta: Meta, key: ItemKey): ShopResult {
  const cost = ITEMS[key].cost;
  if (meta.gold < cost) return { ok: false, msg: 'Not enough gold' };
  meta.gold -= cost;
  meta.items[key]++;
  return { ok: true, msg: `${ITEMS[key].n} ×${meta.items[key]}` };
}

/* ---------------- run lifecycle ---------------- */

/**
 * Called once the lair exists, before the first tick. A generated prisoner
 * consumes a thief id even if nobody ever frees them — the prototype did this
 * and recruit naming depends on it.
 */
export function commitRunStart(meta: Meta, run: { freshPrisonerTid: number | null }): void {
  if (run.freshPrisonerTid !== null) meta.uid = Math.max(meta.uid, run.freshPrisonerTid);
}

/** $LOOT earned by a successful run (handoff §9). */
export function lootTokens(r: {
  depth: number;
  stolenPct: number;
  slain: boolean;
  guardsSlain: number;
}): number {
  return (
    r.depth * 3 + (r.stolenPct >= 60 ? r.depth * 2 : 0) + (r.slain ? 12 : 0) + Math.floor(r.guardsSlain / 3)
  );
}

export interface RunPayout {
  tok: number;
  goldGained: number;
  /** roster news to show alongside the run-over card */
  notes: FeedLine[];
  /** the depth the run was played at (the meta has already moved on) */
  depthPlayed: number;
}

/**
 * Applies a finished run to the hideout. Mirrors the prototype's `endRun`
 * bookkeeping exactly, including the order of roster changes: the engine
 * records them chronologically so a rescue that empties a lost-queue slot
 * before a later death leaves room for that death.
 */
export function applyRunResult(meta: Meta, r: RunResult): RunPayout {
  const notes: FeedLine[] = [];
  const depthPlayed = meta.depth;

  for (const k of ITEM_KEYS) meta.items[k] = Math.max(0, meta.items[k] - r.itemsUsed[k]);

  for (const op of r.crewOps) {
    if (op.op === 'freeFromQueue') {
      const ix = meta.lost.findIndex((t) => t.tid === op.tid);
      if (ix >= 0) meta.lost.splice(ix, 1);
    } else {
      const ix = meta.crew.findIndex((t) => t.tid === op.tid);
      if (ix >= 0) {
        const th = meta.crew.splice(ix, 1)[0] as RunThief;
        if (meta.lost.length < LOST_CAP) meta.lost.push(th);
      }
    }
  }

  let tok = 0;
  let goldGained = 0;

  if (r.success) {
    for (const tid of r.survivorsTids) {
      const th = meta.crew.find((t) => t.tid === tid);
      if (th) th.xp++;
    }

    if (r.rescue?.extracted) {
      const th = r.rescue.thief;
      if (meta.crew.length < CREW_CAP) {
        meta.crew.push({ ...th });
        notes.push({ msg: `${th.name} joins the crew — welcome back.`, cls: 'k' });
      } else {
        meta.gold += 150;
        notes.push({ msg: `${th.name} paid 150g and vanished into the night.`, cls: 'w' });
      }
    }

    meta.gold += r.loot;
    goldGained = r.loot;
    meta.todayBest = Math.max(meta.todayBest, Math.round(r.loot));
    tok = lootTokens({
      depth: depthPlayed,
      stolenPct: r.stolenPct,
      slain: r.slain,
      guardsSlain: r.guardsSlain,
    });
    meta.tok += tok;
    meta.best = Math.max(meta.best, depthPlayed);
    meta.depth++;
  }

  return { tok, goldGained, notes, depthPlayed };
}

/** Deep copy — the hideout is mutated in place, so callers snapshot first. */
export function cloneMeta(meta: Meta): Meta {
  return {
    ...meta,
    crew: meta.crew.map((t) => ({ ...t })),
    lost: meta.lost.map((t) => ({ ...t })),
    items: { ...meta.items },
    up: { ...meta.up },
    upCost: { ...meta.upCost },
  };
}

/**
 * The subset of the hideout a run is allowed to see, deep-copied.
 *
 * Phase 2 stores exactly this in `Run.metaSnapshot` (handoff §7) so a submitted
 * result can be validated against the crew and gear that actually went in.
 */
export function snapshotRunMeta(meta: Meta): RunMeta {
  return {
    depth: meta.depth,
    uid: meta.uid,
    crew: meta.crew.map((t) => ({ ...t })),
    lost: meta.lost.map((t) => ({ ...t })),
    items: { ...meta.items },
    up: { ...meta.up },
  };
}
