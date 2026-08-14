/**
 * The v0.4 X profile header, 1500x500.
 *
 * Two constraints the platform imposes, both taken from the existing header's
 * notes: the profile photo is overlaid on the **lower left**, so nothing may
 * live there; and narrow screens crop the **left and right edges**, so the
 * lockup stays inside the middle ~870 px. This is a relayout of the banner, not
 * a squash of it — the same real frame of the game, recomposed.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const SHOTS = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/shots';
const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/banner';
const BRAND = '/home/user/hoardbreak/apps/web/public/brand';

const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const lair = b64(`${SHOTS}/raid-heart-canvas.png`); // the wyrm up, the Heart bare — 2348x1548
const seal = readFileSync(`${BRAND}/dragonjob-seal.svg`, 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

const html = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1500px;height:500px;overflow:hidden;background:#040806}
.stage{position:relative;width:1500px;height:500px;overflow:hidden;background:#040806}
#bg{position:absolute;width:2200px;left:-300px;top:-210px;display:block}
/* the same three-part veil the shipped header uses: a warm pool behind the
   lockup, a top-and-bottom fade, and a vignette to hold the edges down */
#veil{position:absolute;inset:0;background:
  radial-gradient(44% 130% at 50% 52%, rgba(255,215,94,.14), transparent 72%),
  linear-gradient(180deg, rgba(4,8,6,.62), rgba(4,8,6,.10) 30%, rgba(4,8,6,.16) 62%, rgba(4,8,6,.80)),
  radial-gradient(128% 158% at 50% 50%, rgba(4,8,6,.10) 0%, rgba(4,8,6,.72) 68%, rgba(4,8,6,.96) 100%)}
#lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:38px}
#lock svg{width:196px;height:196px;flex:0 0 auto;
  filter:drop-shadow(0 14px 40px rgba(0,0,0,.75)) drop-shadow(0 0 26px rgba(255,215,94,.18))}
.txt{display:flex;flex-direction:column}
h1{font-family:'Pirata One';font-size:70px;line-height:1;letter-spacing:.045em;white-space:nowrap;
  color:#f6ead0;text-shadow:0 3px 22px rgba(0,0,0,.9)}
h1 .v{color:#ffd75e;font-size:34px;margin-left:16px;text-shadow:0 0 20px rgba(255,215,94,.5)}
.rule{height:1px;margin:16px 0 13px;background:linear-gradient(90deg,#c08f2c,rgba(192,143,44,.10))}
.tag{font-family:Gelasio,Georgia,serif;font-style:italic;font-size:19px;color:#e8dccb;
  text-shadow:0 2px 12px rgba(0,0,0,.9)}
.dom{font-family:'DejaVu Sans Mono',monospace;font-size:14px;letter-spacing:.28em;color:#ffd75e;
  margin-top:15px;text-shadow:0 2px 12px rgba(0,0,0,.9)}
</style>
<div class="stage">
  <img id="bg" src="${lair}">
  <div id="veil"></div>
  <div id="lock">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${seal}</svg>
    <div class="txt">
      <h1>THE DRAGON JOB<span class="v">v0.4</span></h1>
      <div class="rule"></div>
      <div class="tag">Take the Heart — twelve seconds to the door.</div>
      <div class="dom">thedragonjob.com</div>
    </div>
  </div>
</div>`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('ERR', String(e)));
await p.setContent(html);
await p.waitForTimeout(900);

// the two rules this layout exists to satisfy, checked rather than assumed
const r = await p.evaluate(() => {
  const svg = document.querySelector('#lock svg').getBoundingClientRect();
  const txt = document.querySelector('.txt').getBoundingClientRect();
  return { left: Math.round(svg.left), right: Math.round(txt.right), bottom: Math.round(Math.max(svg.bottom, txt.bottom)) };
});
console.log(`lockup x ${r.left}..${r.right} — safe band 315..1185: ${r.left >= 315 && r.right <= 1185 ? 'INSIDE' : 'OUTSIDE'}`);
console.log(`clear of the avatar (lower-left 0..250 x 250..500): ${r.left >= 260 ? 'yes' : 'NO — it would be covered'}`);

await p.screenshot({ path: `${OUT}/dragonjob-v04-header-1500x500.png` });
console.log('wrote header 1500x500');
await b.close();
