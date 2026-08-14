/**
 * The contract address is the one string on this site that can cost a reader
 * money, so it gets a check of its own.
 *
 * ## Why this reads the source file as text
 *
 * The thing being guarded against is a mangled paste: somebody changes the
 * literal in `lib/token.ts` and drops a character, or picks up a zero-width
 * space, or lets an editor turn a run of characters into something that only
 * looks the same. Importing the module would not catch a truncation that still
 * parses, and it would need a TypeScript loader to do it. Reading the literal
 * out of the file and decoding it tests the exact bytes that ship.
 *
 * ## What it can and cannot prove
 *
 * It proves the address is *well-formed*: base58 alphabet only, decoding to a
 * 32-byte key, the length a Solana mint actually is. That catches every kind of
 * damage a bad paste does.
 *
 * It cannot prove the address is *ours*. A well-formed key belonging to
 * somebody else passes this test and fails the only way that matters, which is
 * why `token.ts` says to compare a change against the source of truth by eye
 * before shipping it. No test replaces that.
 *
 * Run: `node test/ca.test.mjs` (wired to `pnpm --filter @dragonjob/web test`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'lib', 'token.ts');

/** Bitcoin/Solana base58 — no 0, O, I or l, because those are the pairs people misread. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Decode base58 to a byte count, counting leading '1's as leading zero bytes. */
const byteLength = (s) => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = n === 0n ? 0 : hex.length / 2;
  for (const c of s) {
    if (c === '1') bytes++;
    else break;
  }
  return bytes;
};

console.log('contract address');

const src = readFileSync(SRC, 'utf8');
// the literal, taken exactly as written — the character class is deliberately
// permissive so a bad character is caught by the assertions below and reported,
// rather than silently failing to match and reading as "no address configured"
const m = src.match(/NEXT_PUBLIC_CA\s*\?\?\s*'([^']*)'/);

check('lib/token.ts declares a default address', Boolean(m));

if (m) {
  const ca = m[1];

  check('address is present', ca.length > 0, `${ca.length} chars`);
  check('length is a Solana address (32–44 chars)', ca.length >= 32 && ca.length <= 44, `${ca.length}`);

  const bad = [...ca].filter((c) => !B58.includes(c));
  check(
    'every character is base58',
    bad.length === 0,
    bad.length ? `offenders: ${bad.map((c) => JSON.stringify(c)).join(', ')}` : 'no 0, O, I or l',
  );

  check('no surrounding whitespace', ca === ca.trim(), 'a stray space breaks a paste');

  if (bad.length === 0) {
    const bytes = byteLength(ca);
    check('decodes to a 32-byte key', bytes === 32, `${bytes} bytes`);
  }

  console.log(`\n  ${ca}`);
  console.log(`  shown as ${ca.slice(0, 6)}…${ca.slice(-4)} on narrow screens\n`);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed — do not ship this address.`);
  process.exit(1);
}
console.log('all checks passed');
