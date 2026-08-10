/**
 * API contracts (handoff §6).
 *
 * Phase 1 does not run a server, but the event/input log format has to be
 * settled *now* so that Phase 4's replay verification needs no client change.
 * These schemas are that commitment, and the client already produces data that
 * validates against them.
 */

import { z } from 'zod';

export const zCrewKind = z.enum(['picklock', 'hexer', 'bruiser', 'emberkin', 'golem']);
export const zItemKey = z.enum(['smoke', 'lull', 'trap']);
export const zUpgradeKey = z.enum(['dmg', 'hp', 'inc']);
export const zModId = z.enum(['dark', 'restless', 'garrison', 'gilded', 'quiet']);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD (UTC)');

export const zEventCode = z.enum([
  'LOOT_PILE',
  'CHEST',
  'SIPHON_TICK',
  'GUARD_KILL',
  'SHRINE',
  'ARMORY',
  'RESCUE',
  'ITEM_USE',
  'WAKE_MILESTONE',
  'EXTRACT',
]);

/** `[t in ms, code, value]` */
export const zRunEvent = z.tuple([z.number().int().nonnegative(), zEventCode, z.number().int()]);

export const zThief = z.object({
  tid: z.number().int().positive(),
  name: z.string().min(1).max(24),
  kind: zCrewKind,
  xp: z.number().int().min(0),
});

/* ---------------- GET /daily (public) ---------------- */

export const zBoardRow = z.object({
  n: z.string(),
  s: z.number().int().nonnegative(),
  you: z.boolean().optional(),
});

export const zDailyResponse = z.object({
  date: zDate,
  depths: z.array(z.object({ n: z.number().int().positive(), mod: zModId })),
  board: z.object({ top: z.array(zBoardRow), me: zBoardRow.optional() }),
});

/* ---------------- GET /me ---------------- */

export const zMeResponse = z.object({
  wallet: z.string(),
  gold: z.number().int().min(0),
  loot: z.number().int().min(0),
  depth: z.number().int().positive(),
  bestDepth: z.number().int().min(0),
  crew: z.array(zThief),
  lost: z.array(zThief),
  items: z.record(zItemKey, z.number().int().min(0)),
  upgrades: z.record(zUpgradeKey, z.number().int().min(0)),
});

/* ---------------- camp mutations ---------------- */

export const zRecruitBody = z.object({ kind: zCrewKind });
export const zUpgradeBody = z.object({ key: zUpgradeKey });
export const zItemBody = z.object({ key: zItemKey });

/* ---------------- POST /runs/start ---------------- */

export const zRunStartBody = z.object({ depth: z.number().int().positive().max(99) });

export const zRunStartResponse = z.object({
  runId: z.string(),
  /** uint32 lair seed — HMAC-derived server-side (§5) */
  seed: z.number().int().nonnegative(),
  mod: zModId,
  /** signed { runId, wallet, date, depth, iat } */
  ticket: z.string(),
});

/* ---------------- POST /runs/complete ---------------- */

export const zRunResultBody = z.object({
  success: z.boolean(),
  slain: z.boolean(),
  loot: z.number().int().min(0),
  stolenPct: z.number().int().min(0).max(100),
  guardsSlain: z.number().int().min(0),
  crewLostTids: z.array(z.number().int()),
  rescuedTid: z.number().int().nullable(),
  survivorsTids: z.array(z.number().int()),
  durationMs: z.number().int().min(0),
});

export const zRunCompleteBody = z.object({
  runId: z.string(),
  ticket: z.string(),
  result: zRunResultBody,
  events: z.array(zRunEvent).max(20000),
});

/* ---------------- Phase 4: replay ---------------- */

/**
 * One tick of player intent. A run's input log is an array of these, sparse:
 * only ticks where intent changed need recording, with the tick index attached.
 */
export const zInputFrame = z.object({
  /** tick index this frame takes effect on */
  i: z.number().int().min(0),
  mx: z.number().min(-1).max(1),
  my: z.number().min(-1).max(1),
  mm: z.number().min(0).max(1),
  cmds: z
    .array(
      z.union([
        z.object({ c: z.literal('move'), x: z.number().int(), y: z.number().int() }),
        z.object({ c: z.literal('item'), k: zItemKey }),
        z.object({ c: z.literal('extract') }),
      ]),
    )
    .optional(),
});

export const zReplayBody = z.object({
  runId: z.string(),
  seed: z.number().int().nonnegative(),
  depth: z.number().int().positive(),
  frames: z.array(zInputFrame).max(200000),
});

export type DailyResponse = z.infer<typeof zDailyResponse>;
export type MeResponse = z.infer<typeof zMeResponse>;
export type RunStartResponse = z.infer<typeof zRunStartResponse>;
export type RunCompleteBody = z.infer<typeof zRunCompleteBody>;
export type ReplayBody = z.infer<typeof zReplayBody>;
