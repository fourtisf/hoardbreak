/**
 * What to call a run when it is over.
 *
 * Whether you won is one bit; *how* you played is the interesting part, and it
 * is what makes two successful runs feel different. Lives here rather than in
 * the client because Phase 3's OG share card ("My heist: 2,340 g · Depth 4 ·
 * RESTLESS WYRM", handoff §12) needs the same string server-side.
 */

import type { RunResult } from '@hoardbreak/engine/headless';

export type VerdictId =
  | 'FED'
  | 'SLAYER'
  | 'GHOST'
  | 'WHISKER'
  | 'STRIPPED'
  | 'EMPTY'
  | 'CLEAN';

export interface Verdict {
  id: VerdictId;
  title: string;
  /** one line, shown under the title; empty for the plain outcomes */
  sub: string;
}

const V: Record<VerdictId, Verdict> = {
  FED: { id: 'FED', title: 'THE WYRM FEEDS', sub: '' },
  SLAYER: { id: 'SLAYER', title: 'WYRMSLAYER', sub: 'The mountain is quiet now.' },
  GHOST: { id: 'GHOST', title: 'GHOST', sub: 'Not one of them ever knew you were there.' },
  WHISKER: { id: 'WHISKER', title: 'BY A WHISKER', sub: 'One more second and it would have had you.' },
  STRIPPED: { id: 'STRIPPED', title: 'THE HOARD IS YOURS', sub: 'You left it a bare stone floor.' },
  EMPTY: { id: 'EMPTY', title: 'EMPTY-HANDED', sub: 'You got out. That is something.' },
  CLEAN: { id: 'CLEAN', title: 'CLEAN GETAWAY', sub: '' },
};

/** Most impressive first — a silent run beats a lucky one. */
export function verdictFor(r: RunResult): Verdict {
  if (!r.success) return V.FED;
  if (r.slain) return V.SLAYER;
  if (!r.everSpotted) return V.GHOST;
  if (r.wake >= 90) return V.WHISKER;
  if (r.stolenPct >= 90) return V.STRIPPED;
  if (r.loot === 0) return V.EMPTY;
  return V.CLEAN;
}

export const VERDICTS = V;
