/**
 * Regenerates `prototype-lairs.fixture.json` from the real prototype.
 *
 * Drives `HOARDBREAK_v0.2.html` in Chromium with `requestAnimationFrame`
 * stubbed out, so the sim never advances and `HB.snapshot()` reads the lair
 * exactly as it was generated. The hideout is pinned to a known state before
 * each raid so the engine side can reproduce the same inputs.
 *
 *   pnpm add -D playwright        # not a repo dependency; this is a one-off tool
 *   node test/capture-prototype.mjs > test/prototype-lairs.fixture.json
 *
 * Only needed if the prototype itself ever changes — which, per handoff §2, it
 * should not.
 */

import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const p = await b.newPage();
// freeze the prototype's rAF loop so every snapshot is taken at t = 0,
// before a single guard has taken a step
await p.addInitScript(() => { window.requestAnimationFrame = () => 0; });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + process.cwd().replace(/\/packages\/engine$/, '') + '/HOARDBREAK_v0.2.html');
await p.waitForSelector('#btnStart');
await p.click('#btnStart');
await p.waitForSelector('#camp:not(.hidden)');

// pin the hideout to a known state so the node side can reproduce it exactly
const reset = (d) => p.evaluate((depth) => {
  const M = window.HB.M;
  M.depth = depth; M.uid = 4; M.gold = 300;
  M.lost.length = 0;
  M.crew.length = 0;
  const names = ['Rats','Wick','Sable','Fen'], kinds = ['picklock','picklock','hexer','bruiser'];
  for (let i = 0; i < 4; i++) M.crew.push({ tid: i+1, name: names[i], kind: kinds[i], xp: 0 });
  M.up.dmg = 0; M.up.hp = 0; M.up.inc = 0;
  M.items.smoke = 0; M.items.lull = 0; M.items.trap = 0;
}, d);

const read = () => p.evaluate(() => ({
  snap: window.HB.snapshot(),
  mod: HB.R.mod.id,
  pool0: HB.R.hoard.pool0,
  dragonMax: HB.R.dragon.max,
  exitTiles: HB.R.exitTiles.length,
  prison: HB.R.prison ? [HB.R.prison.fromQ, HB.R.prison.thief.name, HB.R.prison.thief.kind] : null,
  shrine: HB.R.shrine ? [HB.R.shrine.x, HB.R.shrine.y] : null,
  armory: HB.R.armory ? [HB.R.armory.x, HB.R.armory.y] : null,
  uidAfter: HB.M.uid,
  units: HB.R.units.map(u => [u.tid, u.x, u.y, Math.round(u.max*1000)/1000]),
}));

const out = { day: await p.evaluate(() => new Date().toISOString().slice(0,10)), depths: {} };
let first = true;
for (let d = 1; d <= 8; d++) {
  await reset(d);
  await p.click('#btnRaid');
  await p.waitForTimeout(250);
  if (first) { await p.click('#btnTut'); await p.waitForTimeout(150); first = false; }
  out.depths[d] = await read();
  await p.evaluate(() => HB.forceEnd(true));
  await p.waitForTimeout(200);
  await p.click('#btnCamp');
  await p.waitForTimeout(150);
}
out.errors = errs;
console.log(JSON.stringify(out));
await b.close();
