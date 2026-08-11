'use client';

import { useEffect, useRef } from 'react';
import { H, T, W, createRun, dailySeed, modFor, paintLair, todayUTC, type RunMeta } from '@dragonjob/engine';

/** Enough of a crew to satisfy the generator; nobody plays this run. */
const SHOWCASE_META: RunMeta = {
  depth: 1,
  uid: 4,
  crew: [
    { tid: 1, name: 'Rats', kind: 'picklock', xp: 0 },
    { tid: 2, name: 'Wick', kind: 'picklock', xp: 0 },
    { tid: 3, name: 'Sable', kind: 'hexer', xp: 0 },
    { tid: 4, name: 'Fen', kind: 'bruiser', xp: 0 },
  ],
  lost: [],
  items: { smoke: 0, lull: 0, trap: 0 },
  up: { dmg: 0, hp: 0, inc: 0 },
};

/**
 * Draw tonight's actual lair, once, into an offscreen canvas.
 *
 * Not a texture and not a mock-up: this is the depth-1 lair the visitor will
 * raid if they get through the door, generated from the same daily seed the game
 * uses and painted by the same tile pass the renderer uses.
 */
function buildLairLayer(): HTMLCanvasElement | null {
  try {
    const date = todayUTC();
    const depth = 1;
    const run = createRun({
      seed: dailySeed(date, depth),
      depth,
      mod: modFor(date, depth),
      meta: SHOWCASE_META,
      date,
    });
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d');
    if (!g) return null;
    paintLair(g, run);
    // the hoard, glowing up through the dark — the one warm thing down there
    g.globalCompositeOperation = 'lighter';
    for (const p of run.piles) {
      const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, T * 2.4);
      rg.addColorStop(0, 'rgba(255,215,94,.55)');
      rg.addColorStop(1, 'rgba(255,215,94,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(p.x, p.y, T * 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return off;
  } catch {
    return null; // decoration must never take the page down
  }
}

/**
 * The lair, drifting behind whatever is in front of it.
 *
 * Shared by the door and the landing page so both stand on the same ground —
 * a visitor should be looking at the game before they are allowed into it. The
 * motes are pure decoration, so they keep using `Math.random` (handoff §4
 * exempts cosmetic-only randomness).
 */
export default function LairCanvas({ id = 'lcv' }: { id?: string }): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const L = cv.getContext('2d');
    if (!L) return;

    const lair = buildLairLayer();
    // the same bargain render.ts makes: the drift exists for its own sake, so
    // it is the first thing to go when the OS asks for less motion
    const calm =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const size = (): void => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    size();
    window.addEventListener('resize', size);

    const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
    const motes = Array.from({ length: 56 }, () => ({
      x: rnd(0, window.innerWidth),
      y: rnd(0, window.innerHeight),
      v: rnd(8, 26),
      ph: rnd(0, 7),
      r: rnd(1.5, 3),
    }));

    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      L.clearRect(0, 0, cv.width, cv.height);

      if (lair) {
        L.imageSmoothingEnabled = false;
        const sc = Math.max(cv.width / lair.width, cv.height / lair.height) * 1.06;
        const dw = lair.width * sc;
        const dh = lair.height * sc;
        const dx = (cv.width - dw) / 2 + (calm ? 0 : Math.sin(t * 0.06) * 18);
        const dy = (cv.height - dh) / 2 + (calm ? 0 : Math.cos(t * 0.05) * 12);
        L.globalAlpha = 0.62;
        L.drawImage(lair, dx, dy, dw, dh);
        L.globalAlpha = 1;
      }

      for (const p of motes) {
        p.y -= p.v * dt;
        if (p.y < -4) {
          p.y = cv.height + 4;
          p.x = rnd(0, cv.width);
        }
        L.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2.6 + p.ph);
        L.fillStyle = p.ph > 3.5 ? '#3ddc84' : '#ffd75e';
        L.fillRect(p.x, p.y, p.r, p.r);
      }
      L.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, []);

  return <canvas id={id} ref={cvRef} aria-hidden="true" />;
}
