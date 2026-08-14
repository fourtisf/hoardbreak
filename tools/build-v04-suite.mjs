/**
 * THE DRAGON JOB — the v0.4 banner suite.
 *
 * Every image is the game's own canvas, captured through the game's own camera
 * (art4.mjs) with the HUD stripped: no names, no joystick, no hint bar. The
 * plates come out at exactly 16:9, which is the whole trick — `background-size:
 * cover` then lays a plate onto a 1600x900 card one-to-one, so the wyrm lands at
 * the top right and the crew at the bottom centre *by construction*, and the
 * composition needs no hand-nudged pixel offsets to hold together.
 *
 * That leaves the left third quiet, which is where the type goes. A gradient
 * column sits under it so the words never fight the lair's texture, and the
 * treatment on top — warm bloom over the gold, a raking shaft, drifting dust,
 * a hard vignette and real SVG-turbulence grain — is what separates key art
 * from a screenshot. The wordmark is gold foil: a gradient clipped to Pirata
 * One, the game's own display face, over a letterpress shadow.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const ART = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/art';
const OUT = '/tmp/claude-0/-home-user-hoardbreak/54169d5b-74f9-5b7d-8e37-5eae58594506/scratchpad/suite';
const BRAND = '/home/user/hoardbreak/apps/web/public/brand';
mkdirSync(OUT, { recursive: true });

const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const P = {
  sleeping: b64(`${ART}/z-sleeping.png`),
  heart: b64(`${ART}/z-heart.png`),
  collapse: b64(`${ART}/z-collapse.png`),
  wide: b64(`${ART}/z-wide.png`),
};
const seal = readFileSync(`${BRAND}/dragonjob-seal.svg`, 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

const CHROME = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#030705;overflow:hidden}
.stage{position:relative;overflow:hidden;background:#030705;isolation:isolate}
/* the plate: pixel art, never smoothed */
.plate{position:absolute;inset:0;background-repeat:no-repeat;background-size:cover;
  image-rendering:pixelated;filter:saturate(1.1) contrast(1.07)}
.bloom{position:absolute;inset:0;mix-blend-mode:screen;pointer-events:none}
.shaft{position:absolute;inset:-22% -12%;pointer-events:none;mix-blend-mode:screen;opacity:.46;
  background:linear-gradient(101deg,transparent 33%,rgba(255,214,140,.12) 43%,rgba(255,228,175,.2) 49%,
    rgba(255,214,140,.1) 56%,transparent 67%)}
.vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 130% at 56% 40%,rgba(3,7,5,0) 30%,rgba(3,7,5,.5) 72%,rgba(3,7,5,.95) 100%)}
.grain{position:absolute;inset:0;pointer-events:none;opacity:.2;mix-blend-mode:overlay}
.dust i{position:absolute;border-radius:50%;background:rgba(255,226,172,.9);
  box-shadow:0 0 7px 2px rgba(255,206,128,.35);pointer-events:none}
.pirata{font-family:'Pirata One'}
.mono{font-family:'DejaVu Sans Mono',monospace}
.serif{font-family:Gelasio,Georgia,serif;font-style:italic}
.foil{background:linear-gradient(177deg,#fff8de 4%,#ffd75e 33%,#dfa728 63%,#fff2c2 90%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.6)) drop-shadow(0 12px 32px rgba(0,0,0,.9))
         drop-shadow(0 0 28px rgba(255,196,80,.3))}
.bone{color:#f5ecd9;text-shadow:0 3px 0 rgba(0,0,0,.55),0 12px 30px rgba(0,0,0,.92)}
.hair{height:1px;background:linear-gradient(90deg,#c08f2c,rgba(192,143,44,.05))}
.dom{letter-spacing:.26em;color:#ffd75e;font-size:17px}
.badge{display:inline-flex;align-items:center;gap:9px;border-radius:22px;padding:8px 17px;
  font-size:13px;letter-spacing:.24em;text-transform:uppercase;backdrop-filter:blur(3px)}
.badge i{width:7px;height:7px;border-radius:50%;display:block}
`;

const GRAIN = (seed) => `<svg class="grain" xmlns="http://www.w3.org/2000/svg">
  <filter id="g${seed}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}"/>
    <feColorMatrix type="saturate" values="0"/></filter>
  <rect width="100%" height="100%" filter="url(#g${seed})"/></svg>`;

const DUST = (n, seed, w, h) => {
  let s = seed, out = '';
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    const x = 0.35 * w + rnd() * 0.65 * w, y = rnd() * h * 0.86;
    const d = 1.4 + rnd() * 3.2, o = 0.16 + rnd() * 0.46;
    out += `<i style="left:${x|0}px;top:${y|0}px;width:${d.toFixed(1)}px;height:${d.toFixed(1)}px;opacity:${o.toFixed(2)}"></i>`;
  }
  return `<div class="dust">${out}</div>`;
};

const bloom = (x, y, r, c, a) =>
  `<div class="bloom" style="background:radial-gradient(${r}% ${r}% at ${x}% ${y}%,rgba(${c},${a}),rgba(${c},0) 66%)"></div>`;

const W = 1600, H = 900;

const card = (c) => `<style>${CHROME}
.stage{width:${W}px;height:${H}px}
.plate{background-image:url('${c.plate}')}
/* the top band hides the wyrm's health bar, which the renderer always draws
   above an awake dragon and no game state will suppress */
#sky{position:absolute;left:0;right:0;top:0;height:230px;pointer-events:none;
  background:linear-gradient(180deg,#030705 0%,rgba(3,7,5,.92) 34%,rgba(3,7,5,.45) 72%,rgba(3,7,5,0))}
#floor{position:absolute;left:0;right:0;bottom:0;height:300px;pointer-events:none;
  background:linear-gradient(180deg,rgba(3,7,5,0),rgba(3,7,5,.72) 44%,#030705 92%)}
#col{position:absolute;left:0;top:0;bottom:0;width:1000px;pointer-events:none;
  background:linear-gradient(90deg,rgba(3,7,5,.95) 0%,rgba(3,7,5,.86) 38%,rgba(3,7,5,.4) 74%,transparent 100%)}
#top{position:absolute;left:80px;right:80px;top:56px;display:flex;align-items:center;gap:19px}
#top svg{width:72px;height:72px;filter:drop-shadow(0 10px 26px rgba(0,0,0,.92))}
#wm{font-size:38px;letter-spacing:.05em;line-height:1}
#tag{margin-left:auto;text-align:right;line-height:1.95;font-size:12px;letter-spacing:.28em;
  text-transform:uppercase;color:#8fb3a1}
#badge{position:absolute;left:80px;top:186px}
#body{position:absolute;left:80px;width:690px;bottom:148px}
#title{font-size:${c.size || 84}px;line-height:.95;letter-spacing:.035em}
#lede{font-size:21.5px;line-height:1.58;margin-top:19px;color:#e9dece;
  text-shadow:0 2px 18px rgba(0,0,0,.98)}
#rule{margin-top:24px;width:190px}
#foot{position:absolute;left:80px;right:80px;bottom:52px;display:flex;align-items:baseline;justify-content:space-between}
#foot .note{font-size:12px;color:#7d9c8c;letter-spacing:.22em;text-transform:uppercase}
</style>
<div class="stage">
  <div class="plate"></div>
  ${c.blooms.join('')}
  <div class="shaft"></div>
  <div id="sky"></div>
  <div id="floor"></div>
  <div id="col"></div>
  ${DUST(24, c.seed, W, H)}
  <div class="vig"></div>
  ${GRAIN(c.seed)}

  <div id="top">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${seal}</svg>
    <span class="pirata bone" id="wm">THE DRAGON JOB</span>
    <span class="mono" id="tag">a daily extraction heist<br>one lair · one crew · one shot</span>
  </div>
  <div id="badge"><span class="mono badge" style="${c.badgeCss}">${c.badge}</span></div>

  <div id="body">
    <div class="pirata ${c.titleCls}" id="title">${c.title}</div>
    <div class="serif" id="lede">${c.lede}</div>
    <div class="hair" id="rule"></div>
  </div>

  <div id="foot">
    <span class="mono dom">thedragonjob.com</span>
    <span class="mono note">${c.foot}</span>
  </div>
</div>`;

const RED = 'color:#ffd0d6;background:rgba(58,10,16,.66);border:1px solid rgba(255,90,110,.5)';
const AMBER = 'color:#ffd9b0;background:rgba(58,30,10,.66);border:1px solid rgba(255,156,60,.5)';
const GREEN = 'color:#bff5d6;background:rgba(10,40,24,.66);border:1px solid rgba(61,220,132,.45)';

const CARDS = [
  {
    file: 'v04-1-heart', plate: P.heart, seed: 7, titleCls: 'foil', size: 88,
    blooms: [bloom(80, 26, 52, '255,190,90', 0.42), bloom(86, 22, 22, '255,150,60', 0.3)],
    badge: '<i style="background:#ff5a6e;box-shadow:0 0 10px #ff5a6e"></i>new in v0.4',
    badgeCss: RED, title: 'TAKE THE HEART',
    lede: 'The wyrm wakes and leaves its bed, and the Heart of the hoard lies bare. Everything you have banked doubles the moment you touch it — and then you have twelve seconds.',
    foot: 'new lair every day · 00:00 utc',
  },
  {
    file: 'v04-2-twelve', plate: P.collapse, seed: 19, titleCls: 'bone', size: 86,
    blooms: [bloom(78, 24, 48, '255,120,80', 0.4), bloom(50, 60, 40, '255,80,80', 0.16)],
    badge: '<i style="background:#ff5a6e;box-shadow:0 0 10px #ff5a6e"></i>the collapse',
    badgeCss: RED, title: 'TWELVE&nbsp;SECONDS',
    lede: 'Take the Heart and the mountain starts coming down. The wyrm flies. You do not. From here, the door is the whole game.',
    foot: 'seize · run · extract',
  },
  {
    file: 'v04-3-vault', plate: P.sleeping, seed: 33, titleCls: 'foil', size: 76,
    blooms: [bloom(84, 22, 58, '255,196,90', 0.5), bloom(88, 20, 24, '255,150,60', 0.34)],
    badge: '<i style="background:#ff9c3c;box-shadow:0 0 10px #ff9c3c"></i>every sunday',
    badgeCss: AMBER, title: 'THE GRAND VAULT',
    lede: 'One night a week the whole world robs the same lair. Two and a half times the hoard, and the entire cult standing on it.',
    foot: 'sundays · 00:00 utc',
  },
  {
    file: 'v04-4-crew', plate: P.sleeping, seed: 51, titleCls: 'bone', size: 84,
    blooms: [bloom(84, 22, 46, '255,190,90', 0.34), bloom(46, 74, 34, '120,220,150', 0.16)],
    badge: '<i style="background:#3ddc84;box-shadow:0 0 10px #3ddc84"></i>the crew remembers',
    badgeCss: GREEN, title: 'THEY KEEP COUNT',
    lede: 'Vale · Picklock · forty-one raids · Legend. Your thieves carry their history now — and the ones no cage ever gave back have a wall with their names on it.',
    foot: 'rookie · blooded · seasoned · veteran · legend',
  },
];

const header = `<style>${CHROME}
.stage{width:1500px;height:500px}
.plate{background-image:url('${P.wide}')}
#veil{position:absolute;inset:0;background:
  radial-gradient(44% 128% at 50% 50%,rgba(255,215,94,.12),transparent 70%),
  linear-gradient(180deg,rgba(3,7,5,.8) 0%,rgba(3,7,5,.2) 26%,rgba(3,7,5,.2) 62%,rgba(3,7,5,.9)),
  radial-gradient(124% 154% at 50% 50%,rgba(3,7,5,.06) 0%,rgba(3,7,5,.72) 66%,rgba(3,7,5,.97) 100%)}
#lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:38px}
#lock svg{width:184px;height:184px;flex:0 0 auto;
  filter:drop-shadow(0 14px 40px rgba(0,0,0,.82)) drop-shadow(0 0 26px rgba(255,215,94,.2))}
h1{font-size:70px;line-height:1;letter-spacing:.045em;white-space:nowrap}
.v{font-size:29px;letter-spacing:.08em;color:#ffd75e;margin-left:17px;text-shadow:0 0 20px rgba(255,215,94,.55)}
.rule{width:100%;margin:16px 0 12px}
.tag{font-size:18.5px;color:#ecdfcd;text-shadow:0 2px 14px rgba(0,0,0,.95)}
.d{margin-top:14px}
</style>
<div class="stage">
  <div class="plate"></div>
  ${bloom(84, 30, 52, '255,190,90', 0.38)}
  <div class="shaft"></div>
  <div id="veil"></div>
  ${DUST(16, 91, 1500, 500)}
  <div class="vig"></div>
  ${GRAIN(13)}
  <div id="lock">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${seal}</svg>
    <div>
      <h1><span class="pirata foil">THE DRAGON JOB</span><span class="pirata v">v0.4</span></h1>
      <div class="hair rule"></div>
      <div class="serif tag">Take the Heart — twelve seconds to the door.</div>
      <div class="mono dom d">thedragonjob.com</div>
    </div>
  </div>
</div>`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const c of CARDS) {
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('ERR', c.file, String(e)));
  await p.setContent(card(c));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${c.file}-1600x900.png` });
  console.log('wrote', c.file);
  await p.close();
}
const hp = await b.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 1 });
await hp.setContent(header);
await hp.waitForTimeout(700);
const safe = await hp.evaluate(() => {
  const s = document.querySelector('#lock svg').getBoundingClientRect();
  const t = document.querySelector('#lock div').getBoundingClientRect();
  return { l: Math.round(s.left), r: Math.round(t.right) };
});
console.log(`header lockup x ${safe.l}..${safe.r} · safe band 315..1185: ${safe.l >= 315 && safe.r <= 1185 ? 'INSIDE' : 'OUTSIDE'}`);
await hp.screenshot({ path: `${OUT}/v04-header-1500x500.png` });
console.log('wrote header');
await b.close();
