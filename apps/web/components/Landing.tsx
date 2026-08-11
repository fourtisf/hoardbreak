'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The landing page, ported from the prototype — copy included. The drifting
 * motes are pure decoration, so they keep using `Math.random` (handoff §4
 * exempts cosmetic-only randomness).
 */
export default function Landing() {
  const router = useRouter();
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const L = cv.getContext('2d');
    if (!L) return;

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

  return (
    <div id="landing">
      <canvas id="lcv" ref={cvRef} />
      <span className="mark markL" aria-hidden="true" />
      <h1>THE DRAGON JOB</h1>
      <div className="tag">
        Rob the dragon. <b>Don&apos;t wake it.</b>
      </div>
      <div className="lsub">
        Lead a named crew of thieves into a sleeping wyrm&apos;s lair. Every day, one lair — same for every player
        on earth. Explore, crack the vaults, siphon the hoard, rescue your fallen… and get out before it wakes.
      </div>
      <button id="btnStart" className="btn gold big" onClick={() => router.push('/hideout')}>
        🜲 GATHER THE CREW
      </button>
    </div>
  );
}
