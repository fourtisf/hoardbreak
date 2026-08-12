/**
 * What changes as you go down (v0.3).
 *
 * Depth used to be a difficulty slider and nothing else: more guard health,
 * more gold, more dragon. Nothing at depth six was *different* from depth one,
 * so descending was a bigger version of a run you had already played rather
 * than a different one.
 *
 * These are three rules, not three multipliers. Each one changes how a night is
 * played rather than how long it takes, each arrives at a named depth, and each
 * is printed on the depth picker before it is chosen — a lair that springs its
 * rules on you is just an unfair lair.
 *
 * They stack. A depth-7 raid is a garrison already on its feet, a wyrm already
 * half awake, and a door that closes on a third of the hoard.
 */
import { TUNING } from './defs.js';

export interface DepthRules {
  /** how many of the lair's guards are already looking for you */
  awakeGuards: number;
  /** the wake meter's starting value — a light sleeper is already half up */
  startWake: number;
  /** fraction of the hoard that turns every guard toward the door */
  sealAt: number;
  /** what to tell the player, before they choose */
  lines: string[];
}

/** The depths at which each rule arrives. Named so the copy and the sim agree. */
export const GARRISON_DEPTH = 3;
export const LIGHT_SLEEPER_DEPTH = 5;
export const TIGHT_DOOR_DEPTH = 7;
export const TIGHT_SEAL_AT = 0.35;

export function depthRules(depth: number): DepthRules {
  const lines: string[] = [];

  const garrison = depth >= GARRISON_DEPTH;
  // two, not "more the deeper you go": the rule is that the lair expects you,
  // and a rule you can state in one sentence is one a player can plan against
  const awakeGuards = garrison ? 2 : 0;
  if (garrison) lines.push('The garrison is already on its feet — two guards start hunting.');

  const lightSleeper = depth >= LIGHT_SLEEPER_DEPTH;
  // starting at the stage-1 threshold rather than at 0 with the stage forced:
  // the meter has to tell the truth, or the number on screen is a lie
  const startWake = lightSleeper ? TUNING.STAGE1_WAKE : 0;
  if (lightSleeper) lines.push('It sleeps lightly here. One eye is open before you are through the door.');

  const tightDoor = depth >= TIGHT_DOOR_DEPTH;
  const sealAt = tightDoor ? TIGHT_SEAL_AT : TUNING.SEAL_AT;
  if (tightDoor) lines.push('They hold the door at a third of the hoard, not a half.');

  return { awakeGuards, startWake, sealAt, lines };
}
