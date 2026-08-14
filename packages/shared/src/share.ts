/**
 * The thing a player pastes into a timeline.
 *
 * A daily game spreads through its results, not its trailer — Wordle grew on a
 * grid of coloured squares, not on advertising. So the card has to survive being
 * read in a feed by somebody who has never heard of the game: short enough to
 * skim, distinctive enough to recognise on the tenth sighting, and specific
 * enough that two people who raided the same lair can argue about it.
 *
 * The wake meter is the signature line. It is the one number that means the same
 * thing to every player on a given day, and the only one that carries the
 * game's whole premise: the fuller the bar, the closer they came to losing
 * everything for the gold they are bragging about.
 */
import type { RunResult } from '@dragonjob/engine/headless';
import { verdictFor } from './verdict.js';

const BAR_CELLS = 10;

/** `▓▓▓▓▓▓▓░░░` — the wake meter, at a glance, in ten characters. */
export function wakeBar(wake: number, cells = BAR_CELLS): string {
  const filled = Math.max(0, Math.min(cells, Math.round((wake / 100) * cells)));
  return '▓'.repeat(filled) + '░'.repeat(cells - filled);
}

export interface ShareInput {
  date: string;
  depth: number;
  /** the night's modifier name, e.g. "A HUNGRY WYRM" */
  mod: string;
  result: RunResult;
  crewIn: number;
  /** names of the crew who did not come home */
  lostNames: string[];
  streak: number;
}

/**
 * Build the shareable card.
 *
 * Deliberately plain text: it survives paste into X, Discord, WhatsApp and a
 * message to one friend, which is where a game this small actually travels. No
 * link shortener, no tracking parameters — the domain is the whole call.
 */
export function shareText(input: ShareInput): string {
  const { date, depth, mod, result: r, crewIn, lostNames, streak } = input;
  const v = verdictFor(r);
  const out = crewIn - r.crewLost;

  const lines = [
    `THE DRAGON JOB · ${date}`,
    `Depth ${depth} · ${mod}`,
    '',
    `🐉 ${wakeBar(r.wake)} ${Math.round(r.wake)}% awake`,
    `💰 ${r.loot.toLocaleString('en-US')}g · ${Math.round(r.stolenPct)}% of the hoard`,
    `👤 ${crewIn} in · ${out} out`,
  ];

  // the part people actually reply to
  if (r.slain) lines.push('', '⚔ THE WYRM IS DEAD.');
  else if (r.heartTaken) lines.push('', '💛 SEIZED THE HEART — and outran the collapse.');
  else if (!r.success) lines.push('', `☠ ${v.title} — nobody came back.`);
  else if (lostNames.length) lines.push('', `☠ Left behind: ${lostNames.join(', ')}`);
  else if (!r.everSpotted) lines.push('', '👻 Never seen. Not once.');

  if (streak > 1) lines.push('', `${streak}-day streak`);

  lines.push('', 'thedragonjob.com');
  return lines.join('\n');
}
