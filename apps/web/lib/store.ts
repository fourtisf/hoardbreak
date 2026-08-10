'use client';

/**
 * Phase 1 meta store: the hideout lives in memory for the length of a session
 * (handoff §12 — "local meta in memory"). Phase 2 replaces the guts of this
 * file with `GET /me` + the `POST /camp/*` mutations; the surface the UI uses
 * (`useMeta`, `mutate`) is designed to survive that swap.
 */

import { useSyncExternalStore } from 'react';
import { createMeta, type Meta } from '@hoardbreak/shared';

let meta: Meta = createMeta();
let version = 0;
let lastRun: string | null = null;
let seenTutorial = false;

const listeners = new Set<() => void>();

function emit(): void {
  version++;
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

/** Mutate the hideout and tell React about it. Returns whatever `fn` returns. */
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

/** The tutorial shows once a session, exactly like the prototype. */
export const tutorialSeen = (): boolean => seenTutorial;
export const markTutorialSeen = (): void => {
  seenTutorial = true;
};

/** Wipe the session — only used by the landing page's "start over". */
export function resetMeta(): void {
  meta = createMeta();
  lastRun = null;
  emit();
}
