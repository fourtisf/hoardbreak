'use client';

/**
 * Phase 1 meta store: the hideout lives in the browser for now (handoff §12 —
 * "local meta in memory"), backed by localStorage so a refresh does not throw
 * away your crew. Phase 2 replaces the guts of this file with `GET /me` and the
 * `POST /camp/*` mutations; the surface the UI uses (`useMeta`, `mutate`) is
 * designed to survive that swap untouched.
 */

import { useSyncExternalStore } from 'react';
import { createMeta, type Meta } from '@dragonjob/shared';

const KEY = 'dragonjob.hideout';
/** Bump when the saved shape changes in a way old saves cannot satisfy. */
const SAVE_VERSION = 4;

interface SavePayload {
  v: number;
  meta: Meta;
  lastRun: string | null;
  /** whether this player has been shown the tutorial */
  tut: boolean;
}

/**
 * Merge a loaded save over a fresh hideout.
 *
 * A save written by an older build will be missing fields, and a half-populated
 * `Meta` crashes the UI on first render. Defaulting field by field means an old
 * save degrades into a playable one instead of a white screen.
 */
function hydrate(raw: unknown): Meta {
  const base = createMeta();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<Meta>;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const rec = (v: unknown): Record<number, number> =>
    v && typeof v === 'object' ? (v as Record<number, number>) : {};
  return {
    ...base,
    gold: num(p.gold, base.gold),
    tok: num(p.tok, base.tok),
    depth: Math.max(1, num(p.depth, base.depth)),
    best: Math.max(0, num(p.best, base.best)),
    uid: Math.max(0, num(p.uid, base.uid)),
    day: typeof p.day === 'string' ? p.day : base.day,
    streak: Math.max(0, num(p.streak, 0)),
    bestStreak: Math.max(0, num(p.bestStreak, 0)),
    lastPlayed: typeof p.lastPlayed === 'string' ? p.lastPlayed : '',
    todayBest: num(p.todayBest, 0),
    todayBestByDepth: rec(p.todayBestByDepth),
    bestByDepth: rec(p.bestByDepth),
    crew: Array.isArray(p.crew) ? p.crew : base.crew,
    lost: Array.isArray(p.lost) ? p.lost : [],
    items: { ...base.items, ...(p.items ?? {}) },
    up: { ...base.up, ...(p.up ?? {}) },
    upCost: { ...base.upCost, ...(p.upCost ?? {}) },
  };
}

let meta: Meta = createMeta();
let lastRun: string | null = null;
let version = 0;
let seenTutorial = false;

/* Load once, on the client. The raid/hideout pages are `ssr: false`, so this
   module never evaluates on the server — the guard is belt and braces. */
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SavePayload>;
      if (p && p.v === SAVE_VERSION) {
        meta = hydrate(p.meta);
        lastRun = typeof p.lastRun === 'string' ? p.lastRun : null;
        // returning players do not need the tutorial thrown at them again
        seenTutorial = p.tut === true;
      }
    }
  } catch {
    /* corrupt or blocked storage — start fresh rather than fail to boot */
  }
}

function save(): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavePayload = { v: SAVE_VERSION, meta, lastRun, tut: seenTutorial };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode, quota, whatever — the game still plays, it just forgets */
  }
}

const listeners = new Set<() => void>();

function emit(): void {
  version++;
  save();
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getVersion = (): number => version;

export function getMeta(): Meta {
  return meta;
}

/** Mutate the hideout, persist it, and tell React. Returns whatever `fn` returns. */
export function mutate<T>(fn: (m: Meta) => T): T {
  const out = fn(meta);
  emit();
  return out;
}

/** Subscribe a component to hideout changes. */
export function useMeta(): Meta {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return meta;
}

export function useLastRun(): string | null {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return lastRun;
}

export function setLastRun(line: string): void {
  lastRun = line;
  emit();
}

/** The tutorial shows once per player, not once per session. */
export const tutorialSeen = (): boolean => seenTutorial;
export const markTutorialSeen = (): void => {
  seenTutorial = true;
  save();
};

/** Wipe the save and start a brand new hideout. */
export function resetMeta(): void {
  meta = createMeta();
  lastRun = null;
  seenTutorial = false;
  emit();
}
