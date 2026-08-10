'use client';

/** The prototype's one-line toast, as a module-level channel. */

const listeners = new Set<(msg: string) => void>();

export function toast(msg: string): void {
  for (const l of listeners) l(msg);
}

export function onToast(fn: (msg: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
