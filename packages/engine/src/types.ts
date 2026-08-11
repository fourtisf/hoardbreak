import type { CrewKind, GuardKind, ItemKey, ModDef, RelicKey, UpgradeKey } from './defs.js';
import type { Rng } from './rng.js';

/* ---------------- meta snapshot ---------------- */

export interface RunThief {
  tid: number;
  name: string;
  kind: CrewKind;
  xp: number;
}

/**
 * Everything the simulation is allowed to know about the hideout. The engine
 * never mutates it — a run reports what happened and the meta layer applies it
 * (Phase 2: server-side, atomically, on `POST /runs/complete`).
 */
export interface RunMeta {
  depth: number;
  /** last allocated thief id — a fresh prisoner consumes the next one */
  uid: number;
  crew: readonly RunThief[];
  lost: readonly RunThief[];
  items: Readonly<Record<ItemKey, number>>;
  up: Readonly<Record<UpgradeKey, number>>;
}

/* ---------------- world entities ---------------- */

export interface PathNode {
  x: number;
  y: number;
}

/** Fields shared by everything that walks a BFS path. */
export interface Walker {
  x: number;
  y: number;
  /** previous-tick position — render interpolation only, never read by the sim */
  px: number;
  py: number;
  path: PathNode[] | null;
  pi: number;
  ptile: number;
  face: number;
}

export interface Unit extends Walker {
  tid: number;
  name: string;
  k: CrewKind;
  lv: number;
  hp: number;
  max: number;
  cd: number;
  slam: number;
  steer: boolean;
  /** gid of whoever this thief is currently swinging at, for target stickiness */
  tgt: number | null;
  /**
   * A personal posting, set by ordering this thief alone.
   *
   * Outranks the crew-wide order and survives it being given, so a Bruiser told
   * to hold a corridor stays there while everyone else runs for the gold. It
   * clears when they are re-ordered as part of the crew — and NOT when they
   * arrive, because "go and stand there" has to mean "and stay".
   */
  ord: { x: number; y: number } | null;
  /** cosmetic bob phase */
  id: number;
  rescued?: boolean;
  rescuedThief?: RunThief;
}

export interface Guard extends Walker {
  /** stable within a run — units remember who they were fighting */
  gid: number;
  k: GuardKind;
  hp: number;
  max: number;
  alert: boolean;
  cd: number;
  hex: number;
  burn: number;
  stun: number;
  id: number;
}

export interface Dragon {
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  max: number;
  awake: boolean;
  /** awake breath cooldown */
  cd: number;
  /** sleeping breath cooldown */
  scd: number;
  /** seconds until it next shifts on its bed or sweeps its tail (v0.3) */
  stir: number;
  stunT: number;
}

export interface Pile {
  x: number;
  y: number;
  amt: number;
}

export interface Chest {
  x: number;
  y: number;
  amt: number;
  prog: number;
  open: boolean;
}

export interface Shrine {
  x: number;
  y: number;
  prog: number;
  done: boolean;
}

export interface Armory {
  x: number;
  y: number;
  done: boolean;
}

export interface Prison {
  x: number;
  y: number;
  prog: number;
  done: boolean;
  /** true when the prisoner came out of the hideout's lost queue */
  fromQ: boolean;
  thief: RunThief;
}

export interface Hoard {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pool: number;
  pool0: number;
}

export interface Trap {
  x: number;
  y: number;
  armed: boolean;
}

/**
 * A relic laid out at the shrine for the taking (v0.3).
 *
 * The prototype granted one relic at random, which meant a run had no build
 * decision in it at all. The shrine now lays out two and you walk into the one
 * you want — diegetic, no modal, no pause, and it reuses the same "stand near
 * the thing" interaction language as chests, armouries and prisons.
 */
export interface RelicOffer {
  k: RelicKey;
  x: number;
  y: number;
}

/* ---------------- presentation ---------------- */

export type Fx =
  | { k: 'txt'; x: number; y: number; txt: string; c?: string; s?: number; l: number; l0: number }
  | { k: 'arrow'; x1: number; y1: number; x2: number; y2: number; c: string; l: number; l0: number }
  | {
      k: 'slash' | 'burst' | 'slam' | 'boom' | 'ember' | 'smoke' | 'heal' | 'blast';
      x: number;
      y: number;
      l: number;
      l0: number;
    };

export interface Tele {
  x: number;
  y: number;
  l: number;
}

export interface Banner {
  t1: string;
  t2: string;
  l: number;
  l0: number;
}

export type FeedClass = 'k' | 'e' | 'w' | '';

export interface FeedLine {
  msg: string;
  cls: FeedClass;
}

export type OscType = 'square' | 'sine' | 'triangle' | 'sawtooth';

/** A note the audio layer should play. `delay` replaces the prototype's setTimeout chords. */
export interface SoundCue {
  f: number;
  d?: number;
  type?: OscType;
  v?: number;
  slide?: number;
  delay?: number;
}

/**
 * Everything the simulation wants to say to the outside world this tick.
 * The host drains it with `drainOutput()`; the sim never touches the DOM.
 */
export interface RunOutput {
  feed: FeedLine[];
  sounds: SoundCue[];
  toasts: string[];
  /** set when the crew list needs rebuilding (join/death) */
  squadDirty: boolean;
}

/* ---------------- scheduled work ---------------- */

/**
 * Replaces the prototype's `setTimeout` callbacks. Real timers cannot survive a
 * fixed-timestep replay, so delayed effects are queued on the run instead.
 */
export type Timer =
  | { k: 'blast'; t: number; x: number; y: number; dmg: number; shake: number; snd: SoundCue }
  /** the sleeping wyrm heaves over onto a new patch of its bed */
  | { k: 'roll'; t: number; x: number; y: number }
  /** its tail comes round across the whole pile */
  | { k: 'tail'; t: number }
  | { k: 'endSlain'; t: number };

/* ---------------- event log (handoff §6) ---------------- */

export type EventCode =
  | 'LOOT_PILE'
  | 'CHEST'
  | 'SIPHON_TICK'
  | 'GUARD_KILL'
  | 'SHRINE'
  | 'ARMORY'
  | 'RESCUE'
  | 'ITEM_USE'
  | 'WAKE_MILESTONE'
  | 'EXTRACT'
  /** v0.3 — which relic was taken; value is the index into RELIC_KEYS */
  | 'RELIC';

/** `[t in ms, code, value]` — compact on purpose, it ships with every run. */
export type RunEvent = [number, EventCode, number];

/* ---------------- input ---------------- */

export type RunCommand =
  /** `tid` sends one thief; omit it and the whole crew goes. */
  | { c: 'move'; x: number; y: number; tid?: number }
  | { c: 'item'; k: ItemKey }
  /** Release a posted thief back to the crew. */
  | { c: 'recall'; tid: number }
  | { c: 'extract' };

/** One tick of player intent. This is the unit of a Phase 4 replay log. */
export interface InputFrame {
  /** normalised movement vector */
  mx: number;
  my: number;
  /** magnitude 0..1 */
  mm: number;
  /** creeping: slower, quieter, harder to spot (v0.3) */
  creep?: boolean;
  commands?: RunCommand[];
}

export const IDLE_INPUT: InputFrame = { mx: 0, my: 0, mm: 0 };

/* ---------------- results ---------------- */

/**
 * An ordered replay of what the run did to the hideout roster. Recorded in
 * chronological order so the meta layer reproduces the prototype's timeline
 * exactly (a rescue that empties a slot before a later death refills it).
 */
export type CrewOp =
  | { op: 'lose'; tid: number }
  | { op: 'freeFromQueue'; tid: number };

export interface RunResult {
  success: boolean;
  slain: boolean;
  loot: number;
  stolenPct: number;
  guardsSlain: number;
  crewLost: number;
  /** how awake the wyrm was when the run ended, 0–100 */
  wake: number;
  durationMs: number;
  /** crew that did not come home (deaths + left behind at extraction) */
  crewLostTids: number[];
  /** in-zone survivors that earn XP */
  survivorsTids: number[];
  rescuedTid: number | null;
  rescue: { thief: RunThief; fromQueue: boolean; extracted: boolean } | null;
  itemsUsed: Record<ItemKey, number>;
  /** nobody ever raised the alarm */
  everSpotted: boolean;
  crewOps: CrewOp[];
  events: RunEvent[];
}

/* ---------------- run state ---------------- */

export interface RunState {
  /* identity */
  date: string;
  depth: number;
  seed: number;
  simSeed: number;
  mod: ModDef;

  /* rng streams (handoff §4) */
  rngGen: Rng;
  rngSim: Rng;

  /* world */
  grid: Uint8Array;
  revealed: Uint8Array;
  units: Unit[];
  guards: Guard[];
  piles: Pile[];
  chests: Chest[];
  traps: Trap[];
  exitTiles: number[];
  exitCtr: { x: number; y: number };
  prison: Prison | null;
  shrine: Shrine | null;
  armory: Armory | null;
  /** relics the shrine has laid out but nobody has picked up yet (v0.3) */
  relicOffers: RelicOffer[];
  hoard: Hoard;
  dragon: Dragon;

  /* run variables */
  t: number;
  ticks: number;
  loot: number;
  wake: number;
  over: boolean;
  guardsSlain: number;
  slain: boolean;
  crewLost: number;
  stage: number;
  smokeT: number;
  runDmg: number;
  relics: Partial<Record<RelicKey, 1>>;
  items: Record<ItemKey, number>;
  itemsUsed: Record<ItemKey, number>;
  cmd: { x: number; y: number } | null;
  /**
   * Set when `cmd` was a posting for one thief.
   *
   * The marker is drawn either way; this stops everyone else reading a solo
   * order as their own, which is what made posting one thief walk the whole
   * crew across the room.
   */
  cmdOnly: number | null;
  cmdT: number;
  /** whether the crew is creeping this tick (v0.3) */
  creep: boolean;
  /** true the moment any guard first notices the crew — a clean run is a GHOST */
  everSpotted: boolean;
  /**
   * The lockdown: half the hoard is gone and the lair has noticed.
   *
   * Guards stop chasing whoever is nearest and go stand between the crew and
   * the door instead. It turns "how much more can I take" from a slider you
   * hold into a decision with a price attached.
   */
  sealed: boolean;
  /** whether the "you are digging under the wyrm" line has been said once */
  deepTold: boolean;
  /** next guard id to hand out */
  gidNext: number;

  /* presentation */
  fx: Fx[];
  tele: Tele[];
  banner: Banner | null;
  timers: Timer[];
  shake: number;
  heartT: number;

  /* bookkeeping */
  meta: RunMeta;
  /** tid consumed by a freshly generated prisoner, so meta.uid can advance */
  freshPrisonerTid: number | null;
  /** set the moment a prisoner is freed; `extracted` is decided at extraction */
  rescue: { thief: RunThief; fromQueue: boolean; extracted: boolean } | null;
  crewOps: CrewOp[];
  events: RunEvent[];
  siphonAcc: number;
  out: RunOutput;
  result: RunResult | null;
}

/** The prototype's `HB.snapshot()` shape — used for determinism checks. */
export interface RunSnapshot {
  mod: string;
  g: [GuardKind, number, number][];
  p: [number, number, number][];
  c: [number, number, number][];
}
