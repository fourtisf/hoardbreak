/**
 * Game definitions — ported verbatim from HOARDBREAK_v0.2.html.
 *
 * Nothing in this file may be "improved". The prototype is the source of truth
 * for every number here (handoff §2, §10). If a value here ever disagrees with
 * the prototype, the prototype wins.
 */

/* ---------------- grid ---------------- */

export const T = 24;
export const TC = 32;
export const TR = 22;
export const W = TC * T;
export const H = TR * T;

export const ROCK = 0;
export const FLOOR = 1;

/** Fixed simulation timestep — 60 Hz (handoff §4). */
export const SIM_DT = 1 / 60;

export const CREW_CAP = 9;
export const LOST_CAP = 6;

export const NAMES = [
  'Rats', 'Wick', 'Sable', 'Fen', 'Moss', 'Briar', 'Kestrel', 'Ash', 'Vex', 'Onyx',
  'Pip', 'Grim', 'Lark', 'Sorrel', 'Nix', 'Tarn', 'Vesper', 'Rook', 'Silt', 'Ember',
] as const;

/* ---------------- crew ---------------- */

export type CrewKind = 'picklock' | 'hexer' | 'bruiser' | 'emberkin' | 'golem';

export interface CrewDef {
  /** display name */
  n: string;
  /** sprite key */
  spr: string;
  hp: number;
  dps: number;
  /** px per second */
  spd: number;
  /** attack range, in tiles */
  range: number;
  /** recruit price, gold */
  cost: number;
  /** skill line shown on the recruit card */
  skL: string;
  /** picklock: chest crack speed multiplier */
  chestMul?: number;
  /** picklock: death burst damage */
  burst?: number;
  /** hexer: hex duration, seconds */
  hex?: number;
  /** bruiser: taunt radius, tiles */
  taunt?: number;
  /** emberkin: ignite duration, seconds */
  burn?: number;
  /** emberkin: dragonfire multiplier */
  fireRes?: number;
  /** golem slam */
  slamDmg?: number;
  slamR?: number;
  slamCd?: number;
  stun?: number;
}

export const UD: Record<CrewKind, CrewDef> = {
  picklock: {
    n: 'Picklock', spr: 'imp', hp: 70, dps: 12, spd: 96, range: 0.85, cost: 60,
    skL: 'cracks chests 2× fast · explodes on death', chestMul: 2, burst: 45,
  },
  hexer: {
    n: 'Hexer', spr: 'shade', hp: 80, dps: 15, spd: 74, range: 3.4, cost: 110,
    skL: 'curses foes: +30% dmg taken', hex: 3,
  },
  bruiser: {
    n: 'Bruiser', spr: 'orc', hp: 320, dps: 20, spd: 56, range: 0.9, cost: 140,
    skL: 'taunts guards onto himself', taunt: 2.4,
  },
  emberkin: {
    n: 'Emberkin', spr: 'wyrmling', hp: 150, dps: 27, spd: 66, range: 2.9, cost: 220,
    skL: 'ignites foes · resists dragonfire', burn: 3, fireRes: 0.5,
  },
  golem: {
    n: 'Bone Golem', spr: 'golem', hp: 560, dps: 25, spd: 38, range: 0.95, cost: 380,
    skL: 'ground slam: AoE + stun', slamDmg: 40, slamR: 1.7, slamCd: 5, stun: 0.8,
  },
};

export const CREW_KINDS = Object.keys(UD) as CrewKind[];

/** The three kinds a randomly generated prisoner can be (prototype genLair). */
export const PRISONER_KINDS: CrewKind[] = ['picklock', 'hexer', 'bruiser'];

/** Starting crew composition (prototype meta bootstrap). */
export const STARTING_CREW: CrewKind[] = ['picklock', 'picklock', 'hexer', 'bruiser'];

/* ---------------- guards ---------------- */

export type GuardKind = 'guard' | 'sentinel' | 'warden' | 'acolyte' | 'high';

export interface GuardDef {
  n: string;
  hp: number;
  dps: number;
  spd: number;
  range: number;
  /** acolyte: hp healed per second */
  heal?: number;
  /** palette A (highlight) */
  cA: string;
  /** palette B (shade) */
  cB: string;
}

export const GD: Record<GuardKind, GuardDef> = {
  guard: { n: 'Cult Guard', hp: 85, dps: 9, spd: 44, range: 0.9, cA: '#c8c8d8', cB: '#5a6a8a' },
  sentinel: { n: 'Sentinel', hp: 75, dps: 12, spd: 48, range: 3.6, cA: '#ffe89e', cB: '#6a5a2a' },
  warden: { n: 'Vault Warden', hp: 220, dps: 14, spd: 36, range: 0.95, cA: '#ffd0d0', cB: '#8a3a4a' },
  acolyte: { n: 'Acolyte', hp: 95, dps: 5, spd: 40, range: 0.9, heal: 9, cA: '#fff8e0', cB: '#8a7a4a' },
  high: { n: 'High Warden', hp: 520, dps: 22, spd: 32, range: 1, cA: '#ffe9a8', cB: '#7a5a1a' },
};

/** The roll table used when populating a mid room (prototype `gk`). */
export const GUARD_POOL: GuardKind[] = ['guard', 'guard', 'sentinel', 'warden', 'acolyte'];

/* ---------------- relics (run-scoped) ---------------- */

export type RelicKey = 'cloak' | 'greed' | 'boots' | 'ward' | 'lock';

export const RELICS: Record<RelicKey, { n: string; d: string }> = {
  cloak: { n: 'Shadow Cloak', d: 'guards notice you far later' },
  greed: { n: 'Greedy Gauntlets', d: 'piles & siphon pay +30%' },
  boots: { n: 'Muffled Boots', d: 'all noise wakes the wyrm 20% less' },
  ward: { n: 'Ember Ward', d: 'crew takes 35% less dragonfire' },
  lock: { n: 'Lockbreaker', d: 'chests spring open instantly' },
};

export const RELIC_KEYS = Object.keys(RELICS) as RelicKey[];

/* ---------------- daily modifiers ---------------- */

export type ModId = 'dark' | 'restless' | 'garrison' | 'gilded' | 'quiet';

export interface ModDef {
  id: ModId;
  n: string;
  d: string;
  /** fog reveal radius override, tiles */
  rev?: number;
  wakeMul?: number;
  hoardMul?: number;
  /** extra guards in the first two mid rooms */
  extraG?: number;
  gHp?: number;
  chestMul?: number;
  pileMul?: number;
  /** added to guard detection radius, tiles */
  alertAdd?: number;
}

export const MODS: ModDef[] = [
  { id: 'dark', n: 'PITCH DARK', d: 'your torchlight is halved', rev: 2.4 },
  { id: 'restless', n: 'RESTLESS WYRM', d: 'wakes 25% faster · hoard ×1.5', wakeMul: 1.25, hoardMul: 1.5 },
  { id: 'garrison', n: 'HEAVY GARRISON', d: 'more, tougher guards · richer chests', extraG: 2, gHp: 1.2, chestMul: 1.4 },
  { id: 'gilded', n: 'GILDED HALLS', d: 'gold everywhere · guards see farther', pileMul: 1.6, alertAdd: 1 },
  { id: 'quiet', n: 'A QUIET NIGHT', d: 'no complications. suspicious.' },
];

/* ---------------- items ---------------- */

export type ItemKey = 'smoke' | 'lull' | 'trap';

export const ITEMS: Record<ItemKey, { n: string; d: string; cost: number; em: string; key: string }> = {
  smoke: { n: 'Smoke Bomb', d: 'guards lose you · 4s blind', cost: 80, em: '💨', key: '1' },
  lull: { n: 'Lullaby Powder', d: '−25 wake (while it sleeps)', cost: 120, em: '🎵', key: '2' },
  trap: { n: 'Bear Trap', d: 'drops behind · stuns pursuers', cost: 100, em: '🪤', key: '3' },
};

export const ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];

/* ---------------- hideout upgrades ---------------- */

export type UpgradeKey = 'dmg' | 'hp' | 'inc';

export const UPGRADES: Record<UpgradeKey, { n: string; d: string; base: number; max: number }> = {
  dmg: { n: 'Sharpened Steel', d: '+15% crew damage', base: 120, max: Infinity },
  hp: { n: 'Padded Leathers', d: '+15% crew health', base: 120, max: Infinity },
  inc: { n: 'Sleepy Incense', d: 'wyrm wakes 20% slower', base: 100, max: 3 },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES) as UpgradeKey[];
export const UPGRADE_COST_MUL = 1.7;

/* ---------------- tuning ----------------
 * Every value below is lifted straight out of the prototype's simulation.
 * Handoff §10 is the human-readable index of the same numbers.
 */

export const TUNING = {
  /* fog */
  REVEAL_R: 3.4,          // per-unit reveal radius during the run
  REVEAL_R_START: 4.5,    // one-off reveal around the entrance at gen time
  REVEAL_R_WAKE: 6,       // reveal around the dragon the moment it wakes
  REVEAL_R_DRAGON: 3.5,   // reveal around an awake, flying dragon

  /* wake sources (per event, or per second where noted) */
  WAKE_PASSIVE: 0.9,      // /s
  WAKE_NEAR_DRAGON: 2.2,  // /s while any crew is within WAKE_NEAR_R
  WAKE_NEAR_R: 6,         // tiles
  WAKE_GUARD_ALERT: 4,
  WAKE_GUARD_KILL: 6,
  WAKE_CHEST: 8,
  WAKE_SIPHON: 6,         // /s, scaled by siphoning crew count
  WAKE_SIPHON_CAP: 3,     // crew factor cap
  WAKE_SLAM: 4,
  WAKE_SHRINE: 4,
  WAKE_RESCUE: 6,
  WAKE_MAX: 100,

  /* wake multipliers */
  INCENSE_MUL: 0.8,       // ^level, level capped at 3 by the shop
  BOOTS_MUL: 0.8,         // Muffled Boots

  /* dragon stages */
  STAGE1_WAKE: 50,
  STAGE2_WAKE: 75,
  HEARTBEAT_WAKE: 70,

  /* guards */
  DETECT_R: 4.4,          // tiles
  CLOAK_MUL: 0.7,         // Shadow Cloak
  GUARD_HP_PER_DEPTH: 0.1,
  GUARD_BOUNTY: 10,
  HEX_MUL: 1.3,
  BURN_DPS: 9,
  GUARD_SWING_CD: 0.32,

  /* crew */
  UNIT_SWING_CD: 0.3,
  UNIT_TARGET_R: 4.6,     // tiles — how far crew look for a guard
  UNIT_MIN_DRAGON_R: 1.4, // tiles — minimum reach against the dragon
  FOLLOW_LEASH: 1.7,      // tiles — how far a follower drifts before catching up
  FOLLOW_SPEED_MUL: 1.12,
  LEADER_SPEED_MUL: 1.08,
  STEER_DEADZONE: 0.12,
  LEVEL_CAP: 5,
  XP_STAT_PER_LEVEL: 0.06,
  UP_DMG_PER_LEVEL: 0.15,
  UP_HP_PER_LEVEL: 0.15,

  /* dragon */
  DRAGON_HP_BASE: 2600,
  DRAGON_HP_PER_DEPTH: 400,
  DRAGON_SPD: 54,         // px/s, ignores walls
  SLEEP_BREATH_CD: 6.5,
  SLEEP_BREATH_CD_S2: 4.2,
  SLEEP_BREATH_TELE: 0.6,
  SLEEP_BREATH_DMG: 55,
  AWAKE_BREATH_CD: 3.6,
  AWAKE_BREATH_TELE: 0.55,
  AWAKE_BREATH_DMG: 85,
  BREATH_R: 2.2,          // tiles
  WARD_MUL: 0.65,         // Ember Ward
  SLAY_BONUS: 2000,
  SLAY_END_DELAY: 1.4,

  /* loot */
  PILE_MIN: 40,
  PILE_MAX: 90,
  PILE_PICKUP_R: 20,      // px
  CHEST_BASE: 120,
  CHEST_PER_DEPTH: 60,
  CHEST_RAND: 60,
  CHEST_CHANCE: 0.7,
  CHEST_TIME: 1.3,
  CHEST_R: 1.2,           // tiles
  HOARD_BASE: 800,
  HOARD_PER_DEPTH: 420,
  SIPHON_RATE: 60,        // gold/s per thief standing on the hoard
  GREED_MUL: 1.3,         // Greedy Gauntlets
  LOW_HOARD_FRAC: 0.15,   // compass flips to EXIT below this much hoard left

  /* rooms */
  SHRINE_TIME: 1.2,
  SHRINE_OVERFLOW: 200,   // gold, when every relic is already owned
  SHRINE_R: 1.3,          // tiles
  ARMORY_R: 1.1,          // tiles
  ARMORY_DMG: 0.15,
  PRISON_TIME: 1.6,
  PRISON_R: 1.3,          // tiles
  CHANNEL_DECAY: 0.6,     // channel progress bleed-off per second when nobody is close

  /* items */
  SMOKE_TIME: 4,
  LULL_WAKE: 25,
  TRAP_GUARD_DMG: 120,
  TRAP_GUARD_STUN: 1.5,
  TRAP_GUARD_R: 13,       // px
  TRAP_DRAGON_DMG: 150,
  TRAP_DRAGON_STUN: 2.5,
  TRAP_DRAGON_R: 20,      // px

  /* misc */
  CMD_MARKER_TIME: 1.4,
  BANNER_DEPTH: 2.8,
  BANNER_RELIC: 3,
  BANNER_WAKE: 3,
  BANNER_RESCUE: 2.6,
} as const;

/* ---------------- lair layout (fixed anchors) ---------------- */

export const ENTRANCE = { x0: 2, y0: 15, x1: 6, y1: 19 } as const;
export const HOARD_ROOM = { x0: 24, y0: 3, x1: 29, y1: 8 } as const;
export const HOARD_PILE = { x0: 26, y0: 4, x1: 28, y1: 7 } as const;
export const MID_ROOM_COUNT = 4;

/** Level from XP — capped at 5 (prototype `lvlOf`). */
export const lvlOf = (t: { xp: number }): number => Math.min(TUNING.LEVEL_CAP, t.xp);
