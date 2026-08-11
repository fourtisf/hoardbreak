/**
 * How you are allowed to arrive at a raid.
 *
 * `/raid` is a real URL, so refreshing it — or pasting it, or restoring the tab
 * tomorrow — used to drop the player straight into a fresh run with no lair
 * behind them and no idea how they got there. A raid should be somewhere you
 * walk into from the hideout, so the hideout hands out a ticket on the way and
 * the raid asks to see it.
 *
 * Two independent checks, because each covers the other's blind spot:
 *
 *  - the ticket is torn up when the page goes away, which is what makes a
 *    refresh fail. `pagehide` rather than `beforeunload`: iOS Safari routinely
 *    skips the latter, and a check that quietly stops working on the platform
 *    most of these players are on is not a check.
 *  - the ticket also expires on its own after a few seconds, so if the tear-up
 *    is missed entirely the raid still refuses a reload that happened later.
 *
 * This is convenience, not enforcement. Anyone who wants to set one
 * sessionStorage key can still open `/raid` directly, exactly as they can walk
 * past the invitation gate — and it costs them nothing worth protecting.
 */

const KEY = 'dj.raidTicket';
/** how long a ticket is good for, in ms — a click-through takes milliseconds */
const TTL = 8000;

/** The hideout is about to send the crew in. */
export function armRaid(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode, or storage disabled — the raid fails open, see below */
  }
}

export function disarmRaid(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear if we could never write */
  }
}

/**
 * Did this player walk here?
 *
 * Fails **open** when sessionStorage throws: a browser that refuses storage
 * would otherwise be unable to raid at all, and a locked door is a far worse
 * bug than a URL that works when it should not.
 */
export function raidArmed(): boolean {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return true;
  }
  if (!raw) return false;
  const t = Number(raw);
  return Number.isFinite(t) && Date.now() - t < TTL;
}
