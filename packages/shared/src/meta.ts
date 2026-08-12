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
  CREW_KINDS,
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
} from '@dragonjob/engine/headless';

export interface Meta {
  /**
   * What the board calls this player.
   *
   * Empty until they are asked at the door. It lives in Meta rather than beside
   * it so a save code carries the name with the hideout — restoring on another
   * machine should not make you a stranger again.
   */
  name: string;
  /**
   * Who this save is on the board.
   *
   * Not a login and not a claim to anything — it exists so the board can keep
   * one row per player instead of one per run, and so a player can find their
   * own row on it. Generated once, travels with the save code, and the server
   * shape-checks it and nothing more.
   */
  pid: string;
  /** sound off, remembered — a player who mutes once should stay muted */
  muted: boolean;
  gold: number;
  /** $LOOT balance (Phase 3 moves this to the ledger) */
  tok: number;
  /**
   * The depth the player has *chosen* to raid next (v0.3).
   *
   * In the prototype this only ever went up, one per clear, which quietly broke
   * the product's own hook: "the same lair for every player on earth" is not
   * true if everybody is locked to their own private depth. Handoff §6 already
   * anticipated the fix — `POST /runs/start` validates `depth ≤ unlocked` — the
   * prototype simply never shipped the picker.
   */
  depth: number;
  /** best depth cleared; `best + 1` is the deepest lair unlocked */
  best: number;
  /** last allocated thief id */
  uid: number;
  /** the UTC day the today-scoped fields belong to */
  day: string;
  /**
   * Consecutive UTC days on which a run was finished.
   *
   * The reason to open the game on a Tuesday when Monday went badly. Broken by
   * a missed day, not by a bad run — the game asks you to show up, not to win.
   */
  streak: number;
  /** longest streak ever held, so breaking one still leaves a mark */
  bestStreak: number;
  /** the last UTC day a run was finished, or '' */
  lastPlayed: string;
  /** biggest single heist today, any depth */
  todayBest: number;
  /** biggest single heist today, per depth — this is what the board ranks */
  todayBestByDepth: Record<number, number>;
  /** all-time personal best per depth, for the hideout's "beat your best" line */
  bestByDepth: Record<number, number>;
  crew: RunThief[];
  lost: RunThief[];
  items: Record<ItemKey, number>;
  up: Record<UpgradeKey, number>;
  upCost: Record<UpgradeKey, number>;
}

/** The deepest lair the player may enter — handoff §6's `unlocked`. */
export const unlockedDepth = (meta: Meta): number => meta.best + 1;

/** Pick tonight's depth. Anything from 1 up to `unlockedDepth` is fair game. */
export function selectDepth(meta: Meta, depth: number): number {
  const max = unlockedDepth(meta);
  meta.depth = Math.max(1, Math.min(max, Math.floor(depth) || 1));
  return meta.depth;
}

/**
 * Roll the today-scoped counters over at UTC midnight (handoff §5).
 * Phase 2 does this server-side in the nightly job; the client still needs it
 * for a session that outlives the day it started in.
 */
export function rollDay(meta: Meta, today: string): boolean {
  if (meta.day === today) return false;
  meta.day = today;
  meta.todayBest = 0;
  meta.todayBestByDepth = {};
  return true;
}

export function newThief(meta: Meta, kind: CrewKind): RunThief {
  meta.uid++;
  return { tid: meta.uid, name: NAMES[(meta.uid - 1) % NAMES.length] as string, kind, xp: 0 };
}

/** A brand new hideout: 300 gold and four names you will get attached to. */
/**
 * A player id: 20 hex characters from the platform's CSPRNG.
 *
 * `crypto.randomUUID` would do, but this travels inside a save code that people
 * paste around, so it is kept short and free of punctuation. Falls back to
 * `Math.random` only where `crypto` is missing entirely — a duplicate id costs
 * somebody a board row, not their hideout.
 */
export function newPid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return [...c.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function createMeta(day = ''): Meta {
  const meta: Meta = {
    name: '',
    pid: newPid(),
    muted: false,
    gold: 300,
    tok: 0,
    depth: 1,
    best: 0,
    uid: 0,
    day,
    streak: 0,
    bestStreak: 0,
    lastPlayed: '',
    todayBest: 0,
    todayBestByDepth: {},
    bestByDepth: {},
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

/**
 * The no-soft-lock guarantee (v0.3).
 *
 * Wipe your whole crew with under 60 gold left and the prototype was over: the
 * RAID button disables at zero crew, and raiding is the only source of income.
 * In Phase 1 a refresh papered over it because meta lived in memory; once §7
 * puts the roster in Postgres it would be a dead account.
 *
 * So: if the roster is empty, the guild fronts you a body. It can never be
 * farmed — you have to have lost everyone to qualify, and a free 60 g Picklock
 * is not worth a wipe.
 */
export function conscript(meta: Meta): ShopResult {
  if (meta.crew.length > 0) return { ok: false, msg: 'You still have a crew' };
  const th = newThief(meta, 'picklock');
  meta.crew.push(th);
  return { ok: true, msg: `${th.name} owes the guild a favour. No charge.` };
}

export const needsConscript = (meta: Meta): boolean =>
  meta.crew.length === 0 && meta.gold < Math.min(...CREW_KINDS.map((k) => UD[k].cost));

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
/** Yesterday, in UTC, for a `YYYY-MM-DD` string. */
function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Advance the streak for a run finished on `today`.
 *
 * Counts the run, not the result — a wipe still keeps the streak alive. The
 * game is asking for the habit, and punishing a bad night by also taking the
 * streak would punish it twice.
 */
export function markPlayed(meta: Meta, today: string): number {
  if (meta.lastPlayed === today) return meta.streak;
  meta.streak = meta.lastPlayed === dayBefore(today) ? meta.streak + 1 : 1;
  meta.lastPlayed = today;
  meta.bestStreak = Math.max(meta.bestStreak, meta.streak);
  return meta.streak;
}

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
    const banked = Math.round(r.loot);
    meta.todayBest = Math.max(meta.todayBest, banked);
    meta.todayBestByDepth[depthPlayed] = Math.max(meta.todayBestByDepth[depthPlayed] ?? 0, banked);
    meta.bestByDepth[depthPlayed] = Math.max(meta.bestByDepth[depthPlayed] ?? 0, banked);
    tok = lootTokens({
      depth: depthPlayed,
      stolenPct: r.stolenPct,
      slain: r.slain,
      guardsSlain: r.guardsSlain,
    });
    meta.tok += tok;
    meta.best = Math.max(meta.best, depthPlayed);
    // step down to the next lair by default, but never past what is unlocked —
    // a player replaying an easier depth stays near where they chose to be
    meta.depth = Math.min(unlockedDepth(meta), depthPlayed + 1);
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
    todayBestByDepth: { ...meta.todayBestByDepth },
    bestByDepth: { ...meta.bestByDepth },
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
