/**
 * The v0.4 banner — final build.
 *
 * Every frame is the running game. The three supporting captures have wildly
 * different aspect ratios (the manifest is 5.7:1, the rival card 3.3:1), so each
 * cell scales its own image to fill the frame by height and is offset by hand to
 * keep the part that matters — the names, the title, the number — inside the
 * crop. Captions sit *under* their frames rather than over them: at this size a
 * scrim over a 143px-tall cell would bury the screenshot it is describing.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOTS = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/shots';
const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/banner';
const BRAND = '/home/user/hoardbreak/apps/web/public/brand';
mkdirSync(OUT, { recursive: true });

const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const IMG = {
  collapse: b64(`${SHOTS}/raid-collapse-canvas.png`), // 2348x1548
  // captured whole, at 3x, by element screenshot — none of these can be cut
  crew: b64(`${SHOTS}/x-crew.png`),                   // 470x132 css
  vault: b64(`${SHOTS}/x-vault.png`),                 // 560x90  css
  rival: b64(`${SHOTS}/x-rival.png`),                 // 340x89  css
};
const seal = readFileSync(`${BRAND}/dragonjob-seal.svg`, 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

const W = 1600, H = 900, M = 72;
const INNER = W - M * 2;                 // 1456
const TOP = 38, HEAD_H = 92;
const HERO_Y = TOP + HEAD_H + 16;        // 146
const HERO_H = 424;
const CELL_W = Math.floor((INNER - 22 * 2) / 3);  // 470
const CELL_Y = HERO_Y + HERO_H + 30;     // 600
const CELL_IMG_H = 142;

/* Each image is sized to fill its 470x142 frame by height, then nudged so the
   part worth showing survives the crop. */
const CELLS = [
  {
    img: IMG.crew, name: 'THE CREW REMEMBERS', c: '#8affc0',
    // shown 1:1 — the one panel whose rows must stay readable. Lifted so the
    // panel's own heading is cropped away cleanly instead of half-showing.
    css: 'width:470px;left:0;top:-22px',
    line: 'Raids survived, ranks earned — and a wall for the ones who never came back.',
  },
  {
    img: IMG.vault, name: 'THE GRAND VAULT', c: '#ffb04c',
    // 560 css wide -> 0.84x across the frame; the title holds at 18px
    css: 'width:470px;left:0;top:33px',
    line: 'Every Sunday, one lair for the whole world. Hoard ×2.4.',
  },
  {
    img: IMG.rival, name: 'RIVALS & WHISPERS', c: '#d6b4ff',
    // 340 css wide -> 1.38x, the most readable of the three
    css: 'width:470px;left:0;top:10px',
    line: 'The name above you, the exact gap — and what tonight’s raiders did.',
  },
];

const html = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:#040806}
.stage{position:relative;width:${W}px;height:${H}px;
  background:radial-gradient(130% 100% at 50% -10%, #0b1912 0%, #060d09 52%, #040806 100%)}
.pirata{font-family:'Pirata One'}
.mono{font-family:'DejaVu Sans Mono',monospace}
.serif{font-family:Gelasio,Georgia,serif;font-style:italic}

.frame{position:absolute;overflow:hidden;border-radius:11px;background:#050a07;
  border:1px solid rgba(120,170,140,.32);
  box-shadow:0 18px 46px rgba(0,0,0,.7), inset 0 0 0 1px rgba(0,0,0,.55)}
.frame img{position:absolute;display:block}

#head{position:absolute;left:${M}px;top:${TOP}px;width:${INNER}px;height:${HEAD_H}px;
  display:flex;align-items:center;gap:20px}
#head svg{width:${HEAD_H}px;height:${HEAD_H}px;flex:0 0 auto;
  filter:drop-shadow(0 10px 26px rgba(0,0,0,.85)) drop-shadow(0 0 20px rgba(255,215,94,.18))}
#wm{font-size:58px;color:#f6ead0;letter-spacing:.045em;line-height:1;text-shadow:0 4px 24px rgba(0,0,0,.9)}
#ver{font-size:28px;color:#ffd75e;letter-spacing:.06em;margin-left:15px;text-shadow:0 0 20px rgba(255,215,94,.5)}
#kick{margin-left:auto;text-align:right;font-size:13px;letter-spacing:.27em;text-transform:uppercase;
  color:#8fb3a1;line-height:1.9}

#hero{left:${M}px;top:${HERO_Y}px;width:${INNER}px;height:${HERO_H}px}
#hero img{width:1720px;left:-268px;top:-44px}
#heroScrim{position:absolute;left:0;right:0;bottom:0;height:214px;
  background:linear-gradient(180deg,rgba(4,8,6,0),rgba(4,8,6,.55) 34%,rgba(4,8,6,.93) 78%,rgba(4,8,6,.99))}
#heroCap{position:absolute;left:34px;right:34px;bottom:26px}
#heroCap .n{font-size:48px;color:#ff8b9c;letter-spacing:.04em;text-shadow:0 3px 20px rgba(0,0,0,.98)}
#heroCap .l{font-size:20.5px;color:#f2e6da;margin-top:6px;max-width:1120px;line-height:1.45;
  text-shadow:0 2px 14px rgba(0,0,0,.98)}
#heroTag{position:absolute;right:30px;top:26px;font-size:13.5px;letter-spacing:.24em;text-transform:uppercase;
  color:#ffd0d6;background:rgba(56,10,16,.8);border:1px solid rgba(255,90,110,.55);
  border-radius:20px;padding:7px 16px}

.cellwrap{position:absolute;top:${CELL_Y}px;width:${CELL_W}px}
.cellwrap .frame{position:relative;width:${CELL_W}px;height:${CELL_IMG_H}px;left:0;top:0}
.cellwrap .n{display:block;font-size:22px;letter-spacing:.045em;margin-top:13px}
.cellwrap .l{font-size:13.5px;color:#c3d6c9;line-height:1.45;margin-top:3px}

#foot{position:absolute;left:${M}px;right:${M}px;bottom:32px;
  display:flex;align-items:baseline;justify-content:space-between}
#foot .dom{font-size:19px;color:#ffd75e;letter-spacing:.24em}
#foot .note{font-size:12.5px;color:#7d9c8c;letter-spacing:.2em;text-transform:uppercase}
</style>
<div class="stage">

  <div id="head">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${seal}</svg>
    <div><span class="pirata" id="wm">THE DRAGON JOB</span><span class="pirata" id="ver">v0.4</span></div>
    <div class="mono" id="kick">a daily extraction heist<br>one lair · one crew · one shot</div>
  </div>

  <div class="frame" id="hero">
    <img src="${IMG.collapse}">
    <div id="heroScrim"></div>
    <div class="mono" id="heroTag">new in v0.4</div>
    <div id="heroCap">
      <span class="pirata n">SEIZE THE HEART</span>
      <div class="serif l">The wyrm wakes and leaves its bed, and the Heart of the hoard lies bare.
        Take it and everything you have banked doubles — then it enrages, and you have twelve
        seconds before the roof comes down.</div>
    </div>
  </div>

  ${CELLS.map((c, i) => `<div class="cellwrap" style="left:${M + i * (CELL_W + 22)}px">
    <div class="frame"><img src="${c.img}" style="${c.css}"></div>
    <span class="pirata n" style="color:${c.c}">${c.name}</span>
    <div class="serif l">${c.line}</div>
  </div>`).join('')}

  <div id="foot">
    <span class="mono dom">thedragonjob.com</span>
    <span class="mono note">new lair every day · 00:00 utc</span>
  </div>
</div>`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('ERR', String(e)));
await p.setContent(html);
await p.waitForTimeout(1000);
await p.screenshot({ path: `${OUT}/dragonjob-v04-banner-1600x900.png` });
console.log('wrote 1600x900');

// how it actually lands in a feed
const p2 = await b.newPage({ viewport: { width: 620, height: 349 }, deviceScaleFactor: 1 });
await p2.setContent(`<style>*{margin:0}body{width:620px;height:349px;overflow:hidden;background:#000}
img{width:620px;height:349px;display:block}</style><img src="${b64(`${OUT}/dragonjob-v04-banner-1600x900.png`)}">`);
await p2.waitForTimeout(400);
await p2.screenshot({ path: `${OUT}/timeline-check.png` });
console.log('wrote timeline check');
await b.close();
