/**
 * A hideout you can carry.
 *
 * Everything lives in localStorage, which one cleared cache erases — crew,
 * gold, depths and the streak the game just asked the player to build. Until
 * accounts exist, a save code is the honest fix: a string the player keeps,
 * pastes into another browser, and gets their hideout back.
 *
 * This is portability, not security. The code is readable by anyone who has it
 * and nothing stops a player editing their own numbers — which costs nothing
 * today, because scores are local anyway. When Phase 2 makes the board real,
 * the server regenerates the lair and bounds the score (handoff §6); it must
 * never trust a code like this one.
 */
import { createMeta, type Meta } from './meta.js';

const PREFIX = 'DJ1-';

/** Sum of code points, mod 2^32 — enough to catch a truncated paste. */
function checksum(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h.toString(36);
}

const toB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '');
};

const fromB64 = (s: string): string => {
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Pack a hideout into one pasteable string. */
export function exportSave(meta: Meta): string {
  const json = JSON.stringify(meta);
  return `${PREFIX}${checksum(json)}.${toB64(json)}`;
}

export type ImportResult = { ok: true; meta: Meta } | { ok: false; msg: string };

/**
 * Unpack a save code.
 *
 * Every failure returns a sentence a player can act on, because the only person
 * who ever sees one of these is someone who just pasted something wrong.
 */
export function importSave(code: string): ImportResult {
  const raw = code.trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, msg: 'Nothing pasted.' };
  if (!raw.startsWith(PREFIX)) return { ok: false, msg: 'That is not a Dragon Job save code — it should start with DJ1-.' };

  const rest = raw.slice(PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot < 1) return { ok: false, msg: 'That code is incomplete — copy the whole thing, including the end.' };

  const sum = rest.slice(0, dot);
  let json: string;
  try {
    json = fromB64(rest.slice(dot + 1));
  } catch {
    return { ok: false, msg: 'That code is damaged. Copy it again without adding line breaks.' };
  }
  if (checksum(json) !== sum) return { ok: false, msg: 'That code is damaged or was cut short — copy all of it.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, msg: 'That code is damaged.' };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Meta).crew)) {
    return { ok: false, msg: 'That code does not hold a hideout.' };
  }
  // merged over defaults so a code written by an older build still opens
  return { ok: true, meta: { ...createMeta(), ...(parsed as Meta) } };
}
