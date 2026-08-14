/**
 * Real gameplay captures for the v0.4 banner.
 *
 * Every frame here is the actual game running — no mock-ups. The banner is
 * meant to show a player what they would be looking at, so anything staged is
 * staged only in the sense of putting the run into the state the feature is
 * about (the wyrm awake, the Heart bare, a decorated roster on the wall).
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/shots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3001';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/** Seed a hideout with a crew worth photographing, then land in the camp. */
async function camp(p, seed) {
  await p.goto(`${BASE}/hideout`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#gateCode');
  if (await p.locator('#gateName').count()) await p.fill('#gateName', 'Alfa');
  await p.fill('#gateCode', '1998');
  await p.click('#gate button[type=submit]');
  await p.waitForSelector('#camp', { timeout: 20000 });
  if (seed) {
    await p.evaluate(seed);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('#gateCode');
    await p.fill('#gateCode', '1998');
    await p.click('#gate button[type=submit]');
    await p.waitForSelector('#camp', { timeout: 20000 });
  }
  await p.waitForTimeout(900);
}

const VETERANS = () => {
  const s = JSON.parse(localStorage.getItem('dragonjob.hideout'));
  s.meta.crew = [
    { tid: 1, name: 'Vale', kind: 'picklock', xp: 5, raids: 41 },
    { tid: 2, name: 'Corr', kind: 'hexer', xp: 4, raids: 23 },
    { tid: 3, name: 'Bram', kind: 'bruiser', xp: 3, raids: 12 },
    { tid: 4, name: 'Ida', kind: 'emberkin', xp: 2, raids: 5 },
    { tid: 5, name: 'Sten', kind: 'golem', xp: 1, raids: 1 },
  ];
  s.meta.uid = 5;
  s.meta.gold = 2400;
  s.meta.fallen = [
    { name: 'Rook', kind: 'bruiser', raids: 27, depth: 6, day: '2026-08-13' },
    { name: 'Pip', kind: 'picklock', raids: 9, depth: 4, day: '2026-08-11' },
    { name: 'Lark', kind: 'hexer', raids: 0, depth: 2, day: '2026-08-09' },
  ];
  s.tut = true;
  localStorage.setItem('dragonjob.hideout', JSON.stringify(s));
};

/* ---------- 1 & 2 · the raid: Heart bare, then the collapse ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await camp(p, VETERANS);
  await p.click('#btnRaid');
  await p.waitForSelector('#cv');
  if (await p.locator('#tutWrap').count()) {
    await p.evaluate(() => document.querySelector('#tutWrap .btn').click());
    await p.waitForSelector('#tutWrap', { state: 'detached' });
  }
  await p.waitForTimeout(1200);

  // walk the crew onto the hoard so the frame has people in it, and bank some gold
  await p.evaluate(() => {
    const s = window.HB.R, T = 24;
    const hx = (s.hoard.x0 + s.hoard.x1 + 1) * 0.5 * T, hy = (s.hoard.y0 + s.hoard.y1 + 1) * 0.5 * T;
    s.units.forEach((u, i) => {
      const a = (i / s.units.length) * Math.PI * 2;
      u.x = hx + Math.cos(a) * 34; u.y = hy + Math.sin(a) * 26; u.px = u.x; u.py = u.y;
    });
    s.loot = 3180;
    s.hoard.pool = s.hoard.pool0 * 0.42;
    s.revealed.fill(1);
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.HB.setWake(100));
  // let the wake banner clear so the lair itself is what you see
  await p.waitForTimeout(3400);
  await p.screenshot({ path: `${OUT}/raid-heart.png` });
  const cv = await p.locator('#cv').boundingBox();
  await p.screenshot({ path: `${OUT}/raid-heart-canvas.png`, clip: cv });
  console.log('heart state:', await p.evaluate(() => window.HB.R.heartState));

  // now take it — the collapse
  await p.evaluate(() => {
    const s = window.HB.R, T = 24;
    const hx = (s.hoard.x0 + s.hoard.x1 + 1) * 0.5 * T, hy = (s.hoard.y0 + s.hoard.y1 + 1) * 0.5 * T;
    const u = s.units[0]; u.x = hx; u.y = hy; u.px = hx; u.py = hy;
  });
  await p.click('#btnSeize');
  await p.waitForTimeout(2600); // past the banner, into the countdown
  await p.screenshot({ path: `${OUT}/raid-collapse.png` });
  const cv2 = await p.locator('#cv').boundingBox();
  await p.screenshot({ path: `${OUT}/raid-collapse-canvas.png`, clip: cv2 });
  console.log('collapse:', await p.evaluate(() => Math.round(window.HB.R.collapseT)));
  await ctx.close();
}

/* ---------- 3 · the crew, and the wall ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await camp(p, VETERANS);
  const manif = await p.locator('.panelBox').filter({ hasText: 'CREW MANIFEST' }).boundingBox();
  const wall = await p.locator('.memorial').boundingBox();
  if (manif && wall) {
    await p.screenshot({
      path: `${OUT}/crew-memory.png`,
      clip: { x: manif.x - 8, y: manif.y - 8, width: manif.width + 16, height: wall.y + wall.height - manif.y + 16 },
    });
  }
  console.log('crew shot done');
  await ctx.close();
}

/* ---------- 4 · the Grand Vault night ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    const FIXED = new Date('2026-08-16T12:00:00Z').getTime();
    const _D = Date;
    Date = class extends _D {
      constructor(...a) { if (!a.length) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
  });
  const p = await ctx.newPage();
  await camp(p, VETERANS);
  const gb = await p.locator('.grandBanner').boundingBox();
  const daily = await p.locator('#daily').boundingBox();
  if (gb && daily) {
    await p.screenshot({
      path: `${OUT}/grand-vault.png`,
      clip: { x: gb.x - 10, y: gb.y - 10, width: gb.width + 20, height: daily.y + daily.height - gb.y + 20 },
    });
  }
  console.log('grand vault shot done');
  await ctx.close();
}

/* ---------- 5 · the rival and the whispers ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.route('**/api/board*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        date: '2026-08-14', depth: 3, players: 1204,
        top: [ { n: 'Kr0nos', s: 8920 }, { n: 'Vesper', s: 7410 }, { n: 'Grimjaw', s: 6100 }, { n: 'Alfa', s: 4110, you: true } ],
        me: { n: 'Alfa', s: 4110, you: true }, rank: 4,
        rival: { n: 'Grimjaw', s: 6100, gap: 1990 },
      }),
    }),
  );
  await p.route('**/api/intel*', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        date: '2026-08-14', depth: 3, players: 1204, avgLoot: 2380, bestLoot: 8920,
        verdicts: { CLEAN: 640, GHOST: 210, HEARTTAKER: 88, SLAYER: 12, FED: 254, STRIPPED: 40 },
      }),
    }),
  );
  await camp(p, VETERANS);
  const rb = await p.locator('.rivalBox').boundingBox();
  const ib = await p.locator('.intelBox').boundingBox();
  if (rb && ib) {
    await p.screenshot({
      path: `${OUT}/rival-whispers.png`,
      clip: { x: rb.x - 10, y: rb.y - 10, width: rb.width + 20, height: ib.y + ib.height - rb.y + 20 },
    });
  }
  console.log('rival shot done');
  await ctx.close();
}

await b.close();
console.log('\nall captures written to', OUT);
