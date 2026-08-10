export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const dist = (x1: number, y1: number, x2: number, y2: number): number => Math.hypot(x2 - x1, y2 - y1);

export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');
