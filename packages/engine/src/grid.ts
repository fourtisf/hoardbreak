import { FLOOR, ROCK, T, TC, TR } from './defs.js';
import type { PathNode } from './types.js';

export const gi = (x: number, y: number): number => y * TC + x;

export const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < TC && y < TR;

export const walk = (grid: Uint8Array, x: number, y: number): boolean => inb(x, y) && grid[gi(x, y)] === FLOOR;

export const blockedPx = (grid: Uint8Array, px: number, py: number): boolean => {
  const gx = (px / T) | 0;
  const gy = (py / T) | 0;
  return !inb(gx, gy) || grid[gi(gx, gy)] === ROCK;
};

/** Tile index of a pixel position, clamped to the board. */
export const tileOf = (px: number, py: number): number => {
  const gx = px / T;
  const gy = py / T;
  return gi(
    gx < 0 ? 0 : gx > TC - 1 ? TC - 1 : gx | 0,
    gy < 0 ? 0 : gy > TR - 1 ? TR - 1 : gy | 0,
  );
};

export function carve(grid: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inb(x, y)) grid[gi(x, y)] = FLOOR;
    }
  }
}

/** Two-tile-wide L corridor, horizontal leg first (prototype `corridor`). */
export function corridor(grid: Uint8Array, a: PathNode, b: PathNode): void {
  carve(grid, Math.min(a.x, b.x), a.y, Math.max(a.x, b.x), a.y + 1);
  carve(grid, b.x, Math.min(a.y, b.y), b.x + 1, Math.max(a.y, b.y));
}

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Breadth-first path over floor tiles. Returns `[start, …, target]`, or null
 * when the target is unreachable. Traversal order matches the prototype's
 * queue exactly (a plain FIFO over the same direction order), so paths — and
 * therefore every movement decision downstream — are identical.
 */
export function bfs(grid: Uint8Array, sx: number, sy: number, tx: number, ty: number): PathNode[] | null {
  const prev = new Int16Array(TC * TR).fill(-1);
  const q: number[] = [gi(sx, sy)];
  let head = 0;
  prev[gi(sx, sy)] = gi(sx, sy);
  while (head < q.length) {
    const c = q[head++] as number;
    const cx = c % TC;
    const cy = (c / TC) | 0;
    if (cx === tx && cy === ty) {
      const path: PathNode[] = [];
      let p = c;
      while (p !== prev[p]) {
        path.push({ x: p % TC, y: (p / TC) | 0 });
        p = prev[p] as number;
      }
      path.push({ x: sx, y: sy });
      path.reverse();
      return path;
    }
    for (const d of DIRS) {
      const nx = cx + d[0];
      const ny = cy + d[1];
      if (!walk(grid, nx, ny)) continue;
      const n = gi(nx, ny);
      if (prev[n] !== -1) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  return null;
}

/** Lift the fog in a circle of `r` tiles around a pixel position. */
export function revealAround(revealed: Uint8Array, px: number, py: number, r: number): void {
  const gx = (px / T) | 0;
  const gy = (py / T) | 0;
  const rr = Math.ceil(r);
  for (let y = gy - rr; y <= gy + rr; y++) {
    for (let x = gx - rr; x <= gx + rr; x++) {
      if (!inb(x, y)) continue;
      if (Math.hypot(x - gx, y - gy) <= r) revealed[gi(x, y)] = 1;
    }
  }
}
