/**
 * Art plates, take four — winning the zoom-vs-text fight.
 *
 * The renderer draws world things at the camera scale `k` and screen things —
 * unit names, the wyrm's health bar, the collapse countdown — at a fixed CSS
 * size. So blowing a plate up in the banner magnifies both: at 4x the wyrm
 * looked glorious and "THE ROOF IS COMING DOWN" became a 60px wall of noise.
 *
 * The fix is to zoom the *camera* instead of the image. `viewFor()` takes
 * k = max(cw/768, ch/528, cw/456), so a tall, narrow viewport makes ch/528 the
 * winning term and drives k far past what a wide window gives. At 420x1700 the
 * tiles land near 50px while the labels stay at 8-12px — the ratio flips, and
 * the plate can then be used at close to 1:1 with the wyrm still enormous.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/art';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3001';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const CREW = () => {
  const s = JSON.parse(localStorage.getItem('dragonjob.hideout'));
  s.meta.crew = [
    { tid: 1, name: 'Vale', kind: 'picklock', xp: 5, raids: 41 },
    { tid: 2, name: 'Corr', kind: 'hexer', xp: 4, raids: 23 },
    { tid: 3, name: 'Bram', kind: 'bruiser', xp: 3, raids: 12 },
    { tid: 4, name: 'Ida', kind: 'emberkin', xp: 2, raids: 5 },
  ];
  s.meta.uid = 5; s.meta.gold = 3000; s.tut = true;
  localStorage.setItem('dragonjob.hideout', JSON.stringify(s));
};

const FRAME = (aspect, bias, yBias) => `(() => {
  const W = 768, H = 528, T = 24, FOLLOW = 19, MINTILE = 16;
  const s = window.HB.R, cv = document.querySelector('#cv');
  const cw = cv.clientWidth, ch = cv.clientHeight;
  const alive = s.units.length ? s.units : [{ x: W/2, y: H/2 }];
  let fx = 0, fy = 0; for (const u of alive) { fx += u.x; fy += u.y; }
  fx /= alive.length; fy /= alive.length;
  let k, ox, oy;
  if (Math.min(cw/W, ch/H) * T < MINTILE) {
    k = Math.max(cw/W, ch/H, cw/(FOLLOW*T));
    const vw = cw/k, vh = ch/k;
    ox = vw >= W ? (W-vw)/2 : Math.min(Math.max(fx-vw/2, 0), W-vw);
    oy = vh >= H ? (H-vh)/2 : Math.min(Math.max(fy-vh/2, 0), H-vh);
  } else { k = Math.min(cw/W, ch/H); ox = (W-cw/k)/2; oy = (H-ch/k)/2; }
  const sx = (s.dragon.x-ox)*k, sy = (s.dragon.y-oy)*k;
  const box = cv.getBoundingClientRect();
  let w = cw, h = w / ${aspect};
  if (h > ch) { h = ch; w = h * ${aspect}; }
  let x = sx - w * ${bias}, y = sy - h * ${yBias};
  x = Math.min(Math.max(x, 0), cw - w);
  y = Math.min(Math.max(y, 0), ch - h);
  return { clip: { x: box.x + x, y: box.y + y, width: w, height: h }, k: Math.round(k * 100) / 100, tile: Math.round(k * T) };
})()`;

async function plate(name, prep, o = {}) {
  const { w = 430, h = 1180, dsf = 3, settle = 1200, aspect = 16/9, bias = 0.34, yBias = 0.30, pose } = o;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await p.goto(`${BASE}/hideout`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#gateCode');
  if (await p.locator('#gateName').count()) await p.fill('#gateName', 'Alfa');
  await p.fill('#gateCode', '1998');
  await p.click('#gate button[type=submit]');
  await p.waitForSelector('#camp', { timeout: 20000 });
  await p.evaluate(CREW);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#gateCode');
  await p.fill('#gateCode', '1998');
  await p.click('#gate button[type=submit]');
  await p.waitForSelector('#camp', { timeout: 20000 });
  await p.click('#btnRaid');
  await p.waitForSelector('#cv');
  if (await p.locator('#tutWrap').count()) {
    await p.evaluate(() => document.querySelector('#tutWrap .btn').click());
    await p.waitForSelector('#tutWrap', { state: 'detached' });
  }
  await p.addStyleTag({ content: '#stick,#hintBar,#toast{display:none!important}' });
  await p.evaluate(() => {
    const s = window.HB.R;
    s.guards.length = 0;
    for (const u of s.units) { u.hp = 1e9; u.max = 1e9; }
    // hold the breath off for the whole session: it is the only thing still
    // printing damage numbers over the plate
    setInterval(() => {
      const r = window.HB.R;
      r.dragon.cd = 999; r.dragon.scd = 999; r.dragon.stir = 999;
      r.timers.length = 0; r.tele.length = 0;
      for (const u of r.units) { u.hp = 1e9; u.max = 1e9; }
    }, 60);
  });
  await p.waitForTimeout(900);
  await p.evaluate(prep);
  await p.waitForTimeout(settle);
  await p.evaluate(pose || '(() => {})()');
  // strip the labels: a plate is a picture, not a HUD
  await p.evaluate(() => {
    const s = window.HB.R;
    for (const u of s.units) u.name = '';
    s.dragon.max = s.dragon.hp;  // a full bar is not drawn
  });
  await p.evaluate(() => {
    const s = window.HB.R;
    s.fx.length = 0; s.tele.length = 0; s.banner = null; s.shake = 0;
    for (const u of s.units) { u.hp = 1e9; u.max = 1e9; u.path = null; u.ptile = -1; }
    s.cmd = null;
  });
  await p.waitForTimeout(90);
  const r = await p.evaluate(FRAME(aspect, bias, yBias));
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: r.clip });
  const st = await p.evaluate(() => ({ h: window.HB.R.heartState, c: Math.round(window.HB.R.collapseT), over: window.HB.R.over }));
  console.log(name.padEnd(11), Math.round(r.clip.width) + 'x' + Math.round(r.clip.height),
    '· zoom k=' + r.k, 'tile ' + r.tile + 'px', '·', st.h, st.c ? 'collapse ' + st.c : '', st.over ? 'OVER!' : '');
  await ctx.close();
}

/* The crew stands below and left of the wyrm rather than around it: their name
   labels are drawn above their heads, and a ring around the dragon puts four of
   them straight across its back. */
const ring = (r, ry) => `
  const s = window.HB.R;
  const dx = s.dragon.x, dy = s.dragon.y;
  s.units.forEach((u, i) => {
    u.x = dx - ${r} + (i % 2) * 26; u.y = dy + ${ry} + Math.floor(i / 2) * 24;
    u.px = u.x; u.py = u.y;
  });
  s.revealed.fill(1); s.banner = null; s.fx.length = 0;`;

await plate('z-sleeping', new Function(`${ring(96, 54)} s.loot = 1840; s.wake = 30;`), { pose: `(() => { const s = window.HB.R, dx = s.dragon.x, dy = s.dragon.y;
  s.units.forEach((u, i) => { u.x = dx - 96 + (i % 2) * 28; u.y = dy + 74 + Math.floor(i / 2) * 26;
    u.px = u.x; u.py = u.y; u.path = null; u.ptile = -1; u.ord = null; }); })()` });
await plate('z-heart', new Function(`${ring(104, 58)} s.loot = 3180; window.HB.setWake(100);`), { settle: 2600, pose: `(() => { const s = window.HB.R, dx = s.dragon.x, dy = s.dragon.y;
  s.units.forEach((u, i) => { u.x = dx - 96 + (i % 2) * 28; u.y = dy + 74 + Math.floor(i / 2) * 26;
    u.px = u.x; u.py = u.y; u.path = null; u.ptile = -1; u.ord = null; }); })()` });
await plate('z-collapse', new Function(`${ring(110, 62)} s.loot = 3737;
  window.HB.setWake(100);
  setTimeout(() => {
    const T = 24, hx = (s.hoard.x0 + s.hoard.x1 + 1) * 0.5 * T, hy = (s.hoard.y0 + s.hoard.y1 + 1) * 0.5 * T;
    const u = s.units[0]; u.x = hx; u.y = hy; u.px = hx; u.py = hy;
    const btn = document.querySelector('#btnSeize'); if (btn) btn.click();
    setInterval(() => { if (window.HB.R.collapseT > 0) window.HB.R.collapseT = 9.4; }, 80);
  }, 900);`), { settle: 3600, pose: `(() => { const s = window.HB.R, dx = s.dragon.x, dy = s.dragon.y;
  s.units.forEach((u, i) => { u.x = dx - 96 + (i % 2) * 28; u.y = dy + 74 + Math.floor(i / 2) * 26;
    u.px = u.x; u.py = u.y; u.path = null; u.ptile = -1; u.ord = null; }); })()` });
await plate('z-wide', new Function(`${ring(92, 50)} s.loot = 2400; s.wake = 54; s.stage = 1;`),
  { aspect: 3, yBias: 0.5, pose: `(() => { const s = window.HB.R, dx = s.dragon.x, dy = s.dragon.y;
  s.units.forEach((u, i) => { u.x = dx - 96 + (i % 2) * 28; u.y = dy + 74 + Math.floor(i / 2) * 26;
    u.px = u.x; u.py = u.y; u.path = null; u.ptile = -1; u.ord = null; }); })()` });

await b.close();
console.log('\nplates in', OUT);
