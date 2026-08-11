import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = `${process.cwd()}/apps/web/public/brand`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 500, height: 500 } });
await p.goto(`file://${process.cwd()}/tools/mark.html`);
await p.waitForTimeout(300);

const marks = { signet: 'signet', seal: 'seal', eclipse: 'eclipse' };
const svgs = await p.evaluate((names) => {
  const out = {};
  for (const [key, fn] of Object.entries(names)) {
    const s = window[fn]();
    s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    s.setAttribute('width', '512');
    s.setAttribute('height', '512');
    // namespace the gradient ids so two marks can share a page
    let html = s.outerHTML;
    for (const id of ['goldF', 'deepF', 'goldStroke']) {
      html = html.split(`id="${id}"`).join(`id="${key}-${id}"`).split(`url(#${id})`).join(`url(#${key}-${id})`);
    }
    out[key] = html;
  }
  return out;
}, marks);

for (const [key, html] of Object.entries(svgs)) {
  writeFileSync(`${OUT}/dragonjob-${key}.svg`, `<?xml version="1.0" encoding="UTF-8"?>\n${html}\n`);
  console.log('svg  ', `${key}.svg`, html.length, 'bytes');
}

// 400×400 PNGs — X's avatar upload size, already circle-safe
for (const key of Object.keys(svgs)) {
  await p.setContent(
    `<style>html,body{margin:0;background:#0b1410}svg{display:block;width:400px;height:400px}</style>${svgs[key]}`,
  );
  await p.setViewportSize({ width: 400, height: 400 });
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${OUT}/dragonjob-${key}-400.png`, omitBackground: false, clip: { x: 0, y: 0, width: 400, height: 400 } });
  console.log('png  ', `${key}-400.png`);
}

// X header, 1500×500 — the seal on the game's own ground
await p.setViewportSize({ width: 1500, height: 500 });
await p.setContent(`<style>
html,body{margin:0;height:500px;overflow:hidden}
/* X drops the profile photo over the lower-left, so the lockup sits centred */
body{background:radial-gradient(120% 160% at 50% 42%, #12281c 0%, #0a1410 48%, #050a07 100%);
  display:flex;align-items:center;justify-content:center;gap:52px;
  font-family:ui-monospace,Menlo,Consolas,monospace}
svg{width:268px;height:268px;flex:0 0 auto;filter:drop-shadow(0 10px 34px rgba(0,0,0,.65))}
h1{margin:0;font-size:78px;letter-spacing:.13em;color:#f4e7c2;font-weight:700;line-height:.98}
p{margin:20px 0 0;font-size:23px;letter-spacing:.22em;color:#7d9c8c;text-transform:uppercase}
</style>${svgs.seal}<div><h1>THE<br>DRAGON JOB</h1><p>one lair · one crew · one shot a day</p></div>`);
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/dragonjob-x-header-1500x500.png` });
console.log('png   x-header-1500x500.png');

await b.close();
