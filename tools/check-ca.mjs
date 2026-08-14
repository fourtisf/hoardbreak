/**
 * Does the contract address actually render, and does it fit?
 *
 * The gate renders client-side only (it returns null until `ready` is set in an
 * effect), so `curl` sees an empty document and proves nothing. This walks a
 * real browser through the door and measures the row on the two screens that
 * carry it, at every width that matters.
 *
 * It checks three things a screenshot alone would not settle:
 *   - the full 44 characters are on screen where they should be, and the short
 *     form stands in where they should not;
 *   - the row is not wider than its parent, at any width — an address that
 *     overflows is an address somebody copies half of;
 *   - the visible text is byte-identical to the address in `lib/token.ts`,
 *     because a row that renders a *different* string is the failure that
 *     costs money.
 */
// playwright is installed globally in this container, not as a workspace dep,
// and ESM resolution does not consult NODE_PATH — so it is imported by path
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3000';
const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/ca';
mkdirSync(OUT, { recursive: true });

const CA = readFileSync('apps/web/lib/token.ts', 'utf8').match(/NEXT_PUBLIC_CA\s*\?\?\s*'([^']*)'/)[1];
const SHORT = `${CA.slice(0, 6)}…${CA.slice(-4)}`;

const SIZES = [
  { w: 1440, h: 900, label: 'desktop' },
  { w: 1024, h: 768, label: 'laptop' },
  { w: 768, h: 1024, label: 'tablet' },
  { w: 471, h: 900, label: 'just above the switch' },
  { w: 470, h: 900, label: 'at the switch' },
  { w: 414, h: 896, label: 'iphone plus' },
  { w: 390, h: 844, label: 'iphone 14' },
  { w: 360, h: 740, label: 'android small' },
  { w: 320, h: 568, label: 'iphone SE' },
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Walk the gate: type a name if asked, then the code. */
async function enter(p) {
  // NOT networkidle: the lair canvas behind the gate runs a rAF loop forever,
  // so the network never goes quiet and the wait never returns
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#gate', { timeout: 15000 });
  const name = p.locator('#gateName');
  if (await name.count()) await name.fill('Vale');
  await p.locator('#gateCode').fill('1998');
  await p.locator('#gate button[type=submit]').click();
  await p.waitForSelector('#landing', { timeout: 5000 });
}

/** Measure one `.caRow`: what is visible, and does it stay inside its parent. */
async function measure(p, where) {
  const row = p.locator('.caRow').first();
  await row.waitFor({ state: 'visible', timeout: 5000 });

  return await row.evaluate((el) => {
    const vis = (n) => n && n.getClientRects().length > 0;
    const full = el.querySelector('.caFull');
    const shortEl = el.querySelector('.caShort');
    const parent = el.parentElement;
    return {
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      fullVisible: vis(full),
      fullText: full ? full.textContent : '',
      shortVisible: vis(shortEl),
      shortText: shortEl ? shortEl.textContent : '',
      rowW: Math.round(el.getBoundingClientRect().width),
      parentW: Math.round(parent.getBoundingClientRect().width),
      overflowsViewport: el.getBoundingClientRect().right > window.innerWidth + 0.5,
      // is the row's centre actually the row, or is something painted over it?
      onTop: (() => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(hit && el.contains(hit));
      })(),
      copyLabel: el.querySelector('.caCopy')?.getAttribute('aria-label') ?? '',
    };
  });
}

for (const s of SIZES) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await enter(p);

  console.log(`\n${s.w}x${s.h}  ${s.label}`);

  const m = await measure(p, 'landing');
  const wantFull = s.w > 470;

  check('row is on screen and nothing covers it', m.onTop);
  check('row fits inside its parent', m.rowW <= m.parentW + 1, `${m.rowW}px in ${m.parentW}px`);
  check('row does not overflow the viewport', !m.overflowsViewport);
  check(
    wantFull ? 'shows the full 44 characters' : 'shows the short form',
    wantFull ? m.fullVisible && !m.shortVisible : m.shortVisible && !m.fullVisible,
    `visible: "${wantFull ? m.fullText : m.shortText}"`,
  );
  check('rendered address matches lib/token.ts exactly', m.fullText === CA, m.fullText === CA ? '' : m.fullText);
  check('short form is the expected head…tail', m.shortText === SHORT, m.shortText);
  check('copy button carries the full address', m.copyLabel.includes(CA));

  await p.locator('.caRow').first().screenshot({ path: `${OUT}/landing-${s.w}.png` });
  if (s.w === 1440 || s.w === 390) {
    await p.screenshot({ path: `${OUT}/page-landing-${s.w}.png` });
  }
  await ctx.close();
}

// the hideout copy, and the clipboard, once — at one wide and one narrow size
for (const s of [SIZES[0], SIZES[6]]) {
  const ctx = await b.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  await enter(p);
  await p.goto(`${BASE}/hideout`, { waitUntil: 'domcontentloaded' });
  // a reload re-shows the door — the code is asked for on every page load
  if (await p.locator('#gateCode').count()) {
    await p.locator('#gateCode').fill('1998');
    await p.locator('#gate button[type=submit]').click();
  }

  console.log(`\nhideout ${s.w}x${s.h}`);
  const row = p.locator('.caRow').first();
  await row.scrollIntoViewIfNeeded();
  const m = await measure(p, 'hideout');
  check('row is on screen and nothing covers it', m.onTop);
  check('row fits inside its parent', m.rowW <= m.parentW + 1, `${m.rowW}px in ${m.parentW}px`);
  check('rendered address matches lib/token.ts exactly', m.fullText === CA);

  await p.locator('.caCopy').first().click();
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('COPY puts the exact address on the clipboard', clip === CA, clip === CA ? `${clip.length} chars` : clip);
  check('button confirms the copy', (await p.locator('.caCopy').first().innerText()).includes('COPIED'));

  await row.screenshot({ path: `${OUT}/hideout-${s.w}.png` });
  await ctx.close();
}

await b.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
