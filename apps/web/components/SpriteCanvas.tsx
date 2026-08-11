'use client';

import { useEffect, useRef } from 'react';
import { SPRITES, drawSprite } from '@dragonjob/engine';

/** Draws one of the engine's char-grid sprites, centred and pixel-crisp. */
export default function SpriteCanvas({
  sprite,
  width,
  height,
  pad = 6,
  className,
}: {
  sprite: string;
  width: number;
  height: number;
  pad?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const spr = SPRITES[sprite];
    if (!spr) return;
    const sw = spr.r[0]!.length;
    const sh = spr.r.length;
    const sc = Math.max(1, Math.floor(Math.min((width - pad) / sw, (height - pad) / sh)));
    drawSprite(g, spr, sc, ((width - sw * sc) / 2) | 0, ((height - sh * sc) / 2) | 0);
  }, [sprite, width, height, pad]);

  return <canvas ref={ref} width={width} height={height} className={className} />;
}
