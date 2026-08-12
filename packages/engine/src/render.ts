/**
 * Canvas renderer — a straight port of the prototype's `render()`.
 *
 * The only structural change: the sim now advances in fixed 60 Hz ticks, so
 * every moving thing is drawn at `prev + (cur - prev) * alpha`. At 60 fps that
 * is visually identical to the prototype; above 60 fps it is smoother.
 *
 * Browser-only. Nothing in `sim.ts` imports this, so headless runs never touch
 * a canvas.
 */

import { GD, H, RELICS, ROCK, T, TC, TR, TUNING, UD, W } from './defs.js';
import { gi, inb, tileOf } from './grid.js';
import { SPRITES, drawSprite } from './sprites.js';
import { dist } from './util.js';
import type { Dragon, Guard, RunState, Unit } from './types.js';
import type { View } from './view.js';

type Ctx = CanvasRenderingContext2D;

const ix = (o: { x: number; px: number }, a: number): number => o.px + (o.x - o.px) * a;
const iy = (o: { y: number; py: number }, a: number): number => o.py + (o.y - o.py) * a;

export interface Renderer {
  /** Draw one frame. `t` is absolute seconds, `dt` the real frame delta. */
  render(s: RunState, alpha: number, t: number, dt: number): void;
  /** Rebuild the static rock layer — call once per lair. */
  buildRockCache(s: RunState): void;
  readonly canvas: HTMLCanvasElement;
}

/**
 * Paint a lair's static tile layer — rock, floor, moss and the edge trim where
 * the two meet.
 *
 * Exported because the landing page draws the same lair behind its title, and a
 * second hand-written copy of this pass would drift from the game's own look the
 * first time either side is touched. `buildRockCache` is its only other caller.
 */
export function paintLair(g: Ctx, s: RunState): void {
  g.imageSmoothingEnabled = false;
  const sr = (v: number): number => Math.abs(Math.sin(v) * 43758.5453) % 1;
  for (let y = 0; y < TR; y++) {
    for (let x = 0; x < TC; x++) {
      const c = s.grid[gi(x, y)];
      const px = x * T;
      const py = y * T;
      const sd = x * 7.13 + y * 3.7;
      if (c === ROCK) {
        g.fillStyle = sr(sd) > 0.5 ? '#16291f' : '#122219';
        g.fillRect(px, py, T, T);
        g.fillStyle = '#0b1710';
        g.fillRect(px, py + T - 3, T, 3);
        g.fillStyle = '#234a34';
        g.fillRect(px, py, T, 2);
      } else {
        g.fillStyle = '#101a12';
        g.fillRect(px, py, T, T);
        if ((x + y) % 2) {
          g.fillStyle = 'rgba(0,0,0,.16)';
          g.fillRect(px, py, T, T);
        }
        if (sr(sd * 7) > 0.82) {
          g.fillStyle = '#2ab070';
          g.fillRect(px + ((sr(sd * 6) * 20) | 0), py + ((sr(sd * 8) * 20) | 0), 2, 2);
        }
        const edge = (dx: number, dy: number): boolean => inb(x + dx, y + dy) && s.grid[gi(x + dx, y + dy)] === ROCK;
        g.fillStyle = '#2c5a40';
        if (edge(0, -1)) g.fillRect(px, py, T, 2);
        if (edge(0, 1)) g.fillRect(px, py + T - 2, T, 2);
        if (edge(-1, 0)) g.fillRect(px, py, 2, T);
        if (edge(1, 0)) g.fillRect(px + T - 2, py, 2, T);
      }
    }
  }
}

export interface RendererOptions {
  /**
   * Where the camera is, in world units, and how hard it is zoomed.
   *
   * Supplied by the host rather than computed here because the input layer has
   * to agree with it exactly — a tap is mapped back through the same numbers,
   * and a disagreement puts the crew somewhere other than where the player
   * pointed. Omit it and the whole lair is drawn at natural size, as before.
   */
  view?: () => View;
  /**
   * What the top strip says once the wyrm is up.
   *
   * The engine knows how much health the thing has; it does not know how hard
   * the crew hits, because that lives in the hideout roster. So the host — which
   * does know — supplies the line, and a game that can win the fight stops being
   * told to run from it. Default is the honest answer for most crews.
   */
  huntLine?: () => string;
}

export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOptions = {}): Renderer {
  const huntLine = opts.huntLine ?? (() => '☠ IT HUNTS — get your crew to the exit and EXTRACT');
  const view = opts.view ?? ((): View => ({ k: 1, ox: 0, oy: 0 }));
  const C = canvas.getContext('2d') as Ctx;
  C.imageSmoothingEnabled = false;
  let rockCv: HTMLCanvasElement | null = null;
  let shake = 0;
  // a11y: screen shake, the banner flash and the wake vignette are the three
  // things in here that move for their own sake, so they are the three things
  // that go when the OS asks for less motion
  const calm =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildRockCache(s: RunState): void {
    if (!rockCv) {
      rockCv = document.createElement('canvas');
      rockCv.width = W;
      rockCv.height = H;
    }
    paintLair(rockCv.getContext('2d') as Ctx, s);
  }

  function drawGuard(g2: Guard, t: number, a: number): void {
    const d = GD[g2.k];
    const sc = g2.k === 'high' ? 1.5 : g2.k === 'warden' ? 1.2 : 1;
    const walk2 = g2.alert ? Math.sin(t * 11 + g2.id) : 0;
    const x = Math.round(ix(g2, a));
    const y = Math.round(iy(g2, a));
    if (g2.alert) {
      C.strokeStyle = 'rgba(255,90,110,' + (0.35 + 0.15 * Math.sin(t * 7)) + ')';
      C.lineWidth = 1.5;
      C.beginPath();
      C.arc(x, y + 4, 9 * sc, 0, 7);
      C.stroke();
    }
    C.fillStyle = 'rgba(0,0,0,.42)';
    C.beginPath();
    C.ellipse(x, y + 9 * sc, 7 * sc, 2.6 * sc, 0, 0, 7);
    C.fill();
    C.save();
    C.translate(x, y - Math.abs(walk2) * 1.5);
    C.scale((g2.face || 1) * sc, sc);
    C.fillStyle = '#140a0d';
    C.fillRect(-7, -16, 14, 25);
    C.fillStyle = '#2a2a34';
    C.fillRect(-4, 4 + walk2 * 1.2, 3, 5 - walk2 * 1.2);
    C.fillRect(1, 4 - walk2 * 1.2, 3, 5 + walk2 * 1.2);
    C.fillStyle = d.cB;
    C.fillRect(-6, -8, 12, 13);
    C.fillStyle = d.cA;
    C.fillRect(-5, -7, 10, 9);
    C.fillStyle = '#1a1420';
    C.fillRect(-5, 1, 10, 2);
    C.fillStyle = '#e8c4a0';
    C.fillRect(-3, -14, 7, 6);
    C.fillStyle = '#140a0d';
    C.fillRect(0, -12, 2, 2);
    if (g2.k === 'guard') {
      C.fillStyle = '#9a9aa6';
      C.fillRect(6, -12, 2, 11);
      C.fillStyle = '#5a3a1a';
      C.beginPath();
      C.arc(-7, -2, 4, 0, 7);
      C.fill();
    }
    if (g2.k === 'warden') {
      C.fillStyle = '#b8bcc8';
      C.fillRect(-4, -16, 9, 8);
      C.fillStyle = '#8a3a4a';
      C.fillRect(-9, -8, 4, 12);
      C.fillStyle = '#9a9aa6';
      C.fillRect(6, -13, 2, 12);
    }
    if (g2.k === 'sentinel') {
      C.fillStyle = d.cB;
      C.fillRect(-4, -16, 9, 5);
      C.strokeStyle = '#c9a86a';
      C.lineWidth = 1.6;
      C.beginPath();
      C.arc(8, -4, 6, -1.25, 1.25);
      C.stroke();
    }
    if (g2.k === 'acolyte') {
      C.fillStyle = '#f2ead0';
      C.fillRect(-5, -7, 10, 12);
      C.fillStyle = '#8a6a2a';
      C.fillRect(6, -14, 2, 15);
      C.fillStyle = '#ffe9a8';
      C.fillRect(4.6, -16, 4.8, 2);
    }
    if (g2.k === 'high') {
      C.fillStyle = '#e8d8a0';
      C.fillRect(-4, -16, 9, 8);
      C.fillStyle = '#c94a3a';
      C.fillRect(-1, -19, 3, 4);
      C.fillStyle = '#c9b060';
      C.fillRect(-10, -10, 5, 15);
    }
    C.restore();
    if (g2.hp < g2.max) {
      C.fillStyle = '#0a120d';
      C.fillRect(x - 8, y - 20 * sc, 16, 3);
      C.fillStyle = '#ff5a6e';
      C.fillRect(x - 8, y - 20 * sc, (16 * g2.hp) / g2.max, 3);
    }
    if (g2.hex > 0) {
      C.strokeStyle = '#c9a0f0';
      C.globalAlpha = 0.45 + 0.3 * Math.sin(t * 8);
      C.lineWidth = 1.5;
      C.beginPath();
      C.arc(x, y - 2, 11 * sc, 0, 7);
      C.stroke();
      C.globalAlpha = 1;
    }
    if (g2.burn > 0) {
      C.fillStyle = '#ff9c3c';
      C.globalAlpha = 0.85;
      C.fillRect(x - 3, y - 19 * sc + Math.sin(t * 20) * 1.5, 3, 3);
      C.globalAlpha = 1;
    }
    if (g2.stun > 0) {
      C.fillStyle = '#ffe9a8';
      for (let i = 0; i < 3; i++) {
        const an = t * 6 + i * 2.09;
        C.fillRect(x + Math.cos(an) * 8 - 1, y - 21 * sc + Math.sin(an) * 2.5 - 1, 2, 2);
      }
    }
  }

  function drawUnit(s: RunState, u: Unit, t: number, a: number): void {
    const d = UD[u.k];
    const spr = SPRITES[d.spr] as (typeof SPRITES)[string];
    const isL = u === s.units[0];
    const sc = u.k === 'golem' || u.k === 'bruiser' ? 1.1 : 1;
    const w = (spr.r[0] as string).length;
    const hh = spr.r.length;
    const x = Math.round(ix(u, a));
    const y = Math.round(iy(u, a));
    C.strokeStyle = isL ? 'rgba(255,215,94,.6)' : 'rgba(61,220,132,.45)';
    C.lineWidth = isL ? 2 : 1.5;
    C.beginPath();
    C.arc(x, y + 4, 9 * sc, 0, 7);
    C.stroke();
    C.fillStyle = 'rgba(0,0,0,.38)';
    C.beginPath();
    C.ellipse(x, y + 7, w * 0.4 * sc, 2.6 * sc, 0, 0, 7);
    C.fill();
    const bob = Math.abs(Math.sin(t * 12 + u.id)) * 1.4;
    C.save();
    C.translate(x, y - bob);
    C.scale((u.face || 1) * sc, sc);
    drawSprite(C, spr, 1, -(w >> 1), -(hh - 7));
    C.restore();
    if (u.k === 'bruiser') {
      let near = false;
      for (const g of s.guards) {
        if (g.alert && dist(u.x, u.y, g.x, g.y) < (UD.bruiser.taunt as number) * T) {
          near = true;
          break;
        }
      }
      if (near) {
        C.strokeStyle = 'rgba(255,215,94,' + (0.3 + 0.2 * Math.sin(t * 6)) + ')';
        C.lineWidth = 1.5;
        C.beginPath();
        C.arc(x, y, (UD.bruiser.taunt as number) * T, 0, 7);
        C.stroke();
      }
    }
    if (u.hp < u.max) {
      const by = y - (hh - 7) * sc - 6;
      C.fillStyle = '#0a120d';
      C.fillRect(x - 7, by, 14, 3);
      C.fillStyle = '#3ddc84';
      C.fillRect(x - 7, by, (14 * u.hp) / u.max, 3);
    }
    const ty2 = y - (hh - 7) * sc - 10;
    C.font = 'bold 8px Consolas,monospace';
    C.textAlign = 'center';
    C.fillStyle = 'rgba(4,10,7,.8)';
    C.fillText(u.name, x + 1, ty2 + 1);
    C.fillStyle = isL ? '#ffd75e' : '#8affc0';
    C.fillText(u.name, x, ty2);
    if (isL) {
      const bob2 = Math.sin(t * 5) * 1.5;
      C.fillStyle = '#ffd75e';
      C.beginPath();
      C.moveTo(x, ty2 - 6 + bob2);
      C.lineTo(x - 4, ty2 - 12 + bob2);
      C.lineTo(x + 4, ty2 - 12 + bob2);
      C.closePath();
      C.fill();
    }
    C.textAlign = 'left';
  }

  function drawDragon(s: RunState, t: number, a: number): void {
    const D: Dragon = s.dragon;
    const dx = ix(D, a);
    const dy = iy(D, a);
    const br2 = 1 + (D.awake ? 0.06 : 0.03) * Math.sin(t * (D.awake ? 4 : 2.2));
    C.save();
    C.translate(dx, dy);
    C.scale(br2 * 1.4, br2 * 1.4);
    C.fillStyle = '#153826';
    C.beginPath();
    C.ellipse(0, 0, 26, 15, 0, 0, 7);
    C.fill();
    C.beginPath();
    C.ellipse(-22, 6, 12, 8, -0.4, 0, 7);
    C.fill();
    C.fillStyle = '#1f4d34';
    C.beginPath();
    C.ellipse(2, -3, 20, 11, 0, 0, 7);
    C.fill();
    C.fillStyle = '#2a6a48';
    for (let i = -2; i < 3; i++) C.fillRect(i * 7 - 2, -12, 3, 4);
    C.fillStyle = '#153826';
    C.beginPath();
    C.moveTo(-24, 10);
    C.quadraticCurveTo(-46, 16, -40, 2);
    C.quadraticCurveTo(-38, 10, -26, 6);
    C.closePath();
    C.fill();
    C.fillStyle = '#1f4d34';
    C.fillRect(14, -16, 16, 12);
    C.fillStyle = '#153826';
    C.fillRect(26, -12, 8, 6);
    C.fillStyle = '#cfe3d6';
    C.beginPath();
    C.moveTo(16, -16);
    C.lineTo(13, -24);
    C.lineTo(20, -17);
    C.closePath();
    C.fill();
    C.beginPath();
    C.moveTo(24, -16);
    C.lineTo(23, -23);
    C.lineTo(29, -16);
    C.closePath();
    C.fill();
    if (D.awake) {
      const gl = 0.7 + 0.3 * Math.sin(t * 6);
      C.fillStyle = 'rgba(255,90,60,' + gl + ')';
      C.fillRect(21, -14, 4, 4);
    } else if (s.stage >= 1) {
      const gl = 0.4 + 0.2 * Math.sin(t * 3);
      C.fillStyle = 'rgba(255,170,60,' + gl + ')';
      C.fillRect(21, -13, 4, 2);
    }
    C.restore();
    /* The wyrm's health, on the wyrm.
       It used to appear only once the thing had already been hurt — so for the
       whole opening of the fight there was nothing on screen saying it had
       health at all, and players reasonably concluded it could not be damaged.
       It now shows from the moment it opens its eyes, framed and numbered,
       because "how much is left" is the only question during that fight.
       A sleeping wyrm shows one too if something (a bear trap) has hurt it, but
       only where the crew can see — a bar floating in unexplored dark would
       give away where it sleeps. */
    if (D.awake || (D.hp < D.max && s.revealed[tileOf(D.x, D.y)])) {
      const bw = 78;
      const bh = 7;
      const bx = dx - bw / 2;
      const by = dy - 44;
      const frac = Math.max(0, D.hp) / D.max;
      C.fillStyle = 'rgba(4,10,7,.88)';
      C.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      C.strokeStyle = '#2c4a38';
      C.lineWidth = 1;
      C.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
      C.fillStyle = '#ff5a6e';
      C.fillRect(bx, by, bw * frac, bh);
      C.font = 'bold 8px Consolas,monospace';
      C.textAlign = 'center';
      C.fillStyle = '#ffd0d6';
      C.fillText(`WYRM ${Math.ceil(frac * 100)}%`, dx, by - 3);
      C.textAlign = 'left';
    }
  }

  function render(s: RunState, a: number, t: number, dt: number): void {
    /* One transform for the whole frame.
       Everything below draws in world units exactly as it always has; the
       camera is applied once, here, so no drawing code has to know about it.
       `setTransform` rather than `scale`/`translate` because the backing store
       is sized in device pixels and this is the only place that knows the
       ratio — resetting rather than composing keeps that from accumulating. */
    const v = view();
    const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
    // a window on the lair rather than all of it — the furniture adapts
    const tight = v.ox > 0.5 || v.oy > 0.5;
    C.setTransform(v.k * dpr, 0, 0, v.k * dpr, -v.ox * v.k * dpr, -v.oy * v.k * dpr);
    C.save();
    // `shake` is a render-only field: the sim raises it, the renderer spends it.
    if (s.shake > 0) shake = s.shake;
    s.shake = 0;
    if (calm) shake = 0;
    if (shake > 0) {
      C.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      shake = Math.max(0, shake - dt * 22);
    }
    // clear the visible window, not the lair: zoomed in they are not the same
    C.clearRect(v.ox - 10, v.oy - 10, canvas.clientWidth / v.k + 20, canvas.clientHeight / v.k + 20);
    if (rockCv) C.drawImage(rockCv, 0, 0);

    const hunting = s.dragon.awake;
    // green while the way home is yours; red once the guards are standing on it
    const exitRgb = s.sealed ? '255,90,110' : '61,220,132';
    for (const tix of s.exitTiles) {
      const x = tix % TC;
      const y = (tix / TC) | 0;
      C.fillStyle =
        'rgba(' + exitRgb + ',' + (hunting ? 0.24 + 0.14 * Math.sin(t * 6) : 0.14 + 0.08 * Math.sin(t * 3)) + ')';
      C.fillRect(x * T, y * T, T, T);
    }
    C.font = 'bold ' + (hunting ? 13 : 11) + 'px Consolas,monospace';
    C.textAlign = 'center';
    C.fillStyle = 'rgba(' + exitRgb + ',' + (hunting ? 0.8 + 0.2 * Math.sin(t * 6) : 0.6 + 0.3 * Math.sin(t * 3)) + ')';
    C.fillText(s.sealed ? 'EXIT — HELD' : 'EXIT', s.exitCtr.x, s.exitCtr.y - 16);
    C.fillText('▼', s.exitCtr.x, s.exitCtr.y - 4);
    C.textAlign = 'left';

    const hh = s.hoard;
    if (hh) {
      const p = Math.max(0.12, hh.pool / hh.pool0);
      const cxp = (hh.x0 + 1.5) * T;
      const cyp = (hh.y0 + 2) * T;
      const pg = C.createRadialGradient(cxp, cyp, 4, cxp, cyp, 70 * p + 24);
      pg.addColorStop(0, 'rgba(255,215,94,.30)');
      pg.addColorStop(1, 'rgba(255,215,94,0)');
      C.fillStyle = pg;
      C.fillRect(cxp - 96, cyp - 70, 192, 150);
      C.fillStyle = '#a8862a';
      C.beginPath();
      C.ellipse(cxp, cyp + 8, 40 * p + 14, 12 * p + 5, 0, 0, 7);
      C.fill();
      C.fillStyle = '#ffd75e';
      C.beginPath();
      C.ellipse(cxp, cyp + 5, 33 * p + 11, 10 * p + 4, 0, 0, 7);
      C.fill();

      /* the deep gold — the coins actually under the wyrm.
         It pays more per second and wakes it faster, which is only a decision
         if the player can see where the line is. So the line is drawn: a hot
         ring under the dragon that breathes, and a word for what it is. */
      if (hh.pool > 0 && !s.dragon.awake && s.revealed[tileOf(s.dragon.x, s.dragon.y)]) {
        const r = TUNING.DEEP_R * T;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
        const dg = C.createRadialGradient(s.dragon.x, s.dragon.y, r * 0.3, s.dragon.x, s.dragon.y, r);
        dg.addColorStop(0, `rgba(255,174,60,${0.2 + 0.12 * pulse})`);
        dg.addColorStop(1, 'rgba(255,174,60,0)');
        C.fillStyle = dg;
        C.beginPath();
        C.arc(s.dragon.x, s.dragon.y, r, 0, 7);
        C.fill();
        C.strokeStyle = `rgba(255,174,60,${0.34 + 0.2 * pulse})`;
        C.lineWidth = 1.5;
        C.setLineDash([4, 4]);
        C.beginPath();
        C.arc(s.dragon.x, s.dragon.y, r, 0, 7);
        C.stroke();
        C.setLineDash([]);
        C.font = 'bold 8px Consolas,monospace';
        C.textAlign = 'center';
        C.fillStyle = `rgba(255,196,110,${0.55 + 0.3 * pulse})`;
        C.fillText('DEEP GOLD', s.dragon.x, s.dragon.y + r + 9);
        C.textAlign = 'left';
      }
    }

    for (const p of s.piles) {
      if (!s.revealed[tileOf(p.x, p.y)]) continue;
      C.fillStyle = '#a8862a';
      C.beginPath();
      C.ellipse(p.x, p.y + 3, 7, 3, 0, 0, 7);
      C.fill();
      C.fillStyle = '#ffd75e';
      C.beginPath();
      C.ellipse(p.x, p.y + 1, 5.5, 2.5, 0, 0, 7);
      C.fill();
      C.fillStyle = '#fff0b8';
      C.fillRect(p.x - 1, p.y - 2, 2, 2);
    }

    for (const c of s.chests) {
      if (!s.revealed[tileOf(c.x, c.y)]) continue;
      C.fillStyle = '#140a0d';
      C.fillRect(c.x - 8, c.y - 7, 16, 13);
      C.fillStyle = c.open ? '#3a2a14' : '#5c4420';
      C.fillRect(c.x - 7, c.y - 6, 14, 11);
      C.fillStyle = '#ffd75e';
      C.fillRect(c.x - 7, c.y - 2, 14, 2);
      if (!c.open && c.prog > 0) {
        C.strokeStyle = '#8affc0';
        C.lineWidth = 2;
        C.beginPath();
        C.arc(c.x, c.y - 1, 10, -1.57, -1.57 + 6.28 * Math.min(1, c.prog / TUNING.CHEST_TIME));
        C.stroke();
      }
      if (c.open) {
        C.fillStyle = '#0a0603';
        C.fillRect(c.x - 5, c.y - 5, 10, 4);
      }
    }

    if (s.shrine && s.revealed[tileOf(s.shrine.x, s.shrine.y)]) {
      const s2 = s.shrine;
      C.fillStyle = '#1a1430';
      C.fillRect(s2.x - 8, s2.y - 4, 16, 10);
      C.fillStyle = s2.done ? '#3a2a52' : '#c9a0f0';
      C.globalAlpha = s2.done ? 0.5 : 0.6 + 0.3 * Math.sin(t * 3);
      C.beginPath();
      C.moveTo(s2.x, s2.y - 14);
      C.lineTo(s2.x + 6, s2.y - 4);
      C.lineTo(s2.x - 6, s2.y - 4);
      C.closePath();
      C.fill();
      C.globalAlpha = 1;
      if (!s2.done && s2.prog > 0) {
        C.strokeStyle = '#c9a0f0';
        C.lineWidth = 2;
        C.beginPath();
        C.arc(s2.x, s2.y - 6, 12, -1.57, -1.57 + 6.28 * Math.min(1, s2.prog / TUNING.SHRINE_TIME));
        C.stroke();
      }
    }

    /* the two relics the shrine laid out — walk into the one you want */
    for (const o of s.relicOffers) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 4 + o.x);
      C.fillStyle = '#1a1430';
      C.fillRect(o.x - 9, o.y - 2, 18, 8);
      C.globalAlpha = pulse;
      C.fillStyle = '#c9a0f0';
      C.beginPath();
      C.moveTo(o.x, o.y - 16);
      C.lineTo(o.x + 7, o.y - 5);
      C.lineTo(o.x, o.y + 2);
      C.lineTo(o.x - 7, o.y - 5);
      C.closePath();
      C.fill();
      C.globalAlpha = 1;
      C.strokeStyle = 'rgba(201,160,240,' + (0.3 + 0.25 * Math.sin(t * 4 + o.x)) + ')';
      C.lineWidth = 1.5;
      C.beginPath();
      C.arc(o.x, o.y - 6, TUNING.RELIC_OFFER_R * T, 0, 7);
      C.stroke();
      C.font = 'bold 9px Consolas,monospace';
      C.textAlign = 'center';
      C.fillStyle = 'rgba(4,10,7,.85)';
      C.fillText(RELICS[o.k].n, o.x + 1, o.y - 21);
      C.fillStyle = '#e8d0ff';
      C.fillText(RELICS[o.k].n, o.x, o.y - 22);
      C.textAlign = 'left';
    }

    if (s.armory && s.revealed[tileOf(s.armory.x, s.armory.y)]) {
      const a2 = s.armory;
      C.fillStyle = '#3a2a14';
      C.fillRect(a2.x - 9, a2.y - 8, 18, 14);
      if (!a2.done) {
        C.fillStyle = '#9a9aa6';
        C.fillRect(a2.x - 5, a2.y - 12, 2, 12);
        C.fillRect(a2.x + 3, a2.y - 12, 2, 12);
        C.fillStyle = '#c9a86a';
        C.fillRect(a2.x - 6, a2.y - 13, 4, 2);
        C.fillRect(a2.x + 2, a2.y - 13, 4, 2);
      }
    }

    if (s.prison && s.revealed[tileOf(s.prison.x, s.prison.y)]) {
      const pr = s.prison;
      if (!pr.done) {
        const spr = SPRITES[UD[pr.thief.kind].spr] as (typeof SPRITES)[string];
        C.globalAlpha = 0.85;
        drawSprite(C, spr, 1, pr.x - ((spr.r[0] as string).length >> 1), pr.y - spr.r.length + 6);
        C.globalAlpha = 1;
        C.fillStyle = '#2a2a34';
        for (let i = -1; i <= 1; i++) C.fillRect(pr.x + i * 7 - 1, pr.y - 16, 2.5, 22);
        C.fillRect(pr.x - 9, pr.y - 17, 18, 2.5);
        C.font = 'bold 9px Consolas,monospace';
        C.textAlign = 'center';
        C.fillStyle = 'rgba(255,215,94,' + (0.6 + 0.3 * Math.sin(t * 3)) + ')';
        C.fillText(pr.thief.name, pr.x, pr.y - 22);
        C.textAlign = 'left';
        if (pr.prog > 0) {
          C.strokeStyle = '#8affc0';
          C.lineWidth = 2;
          C.beginPath();
          C.arc(pr.x, pr.y - 4, 13, -1.57, -1.57 + 6.28 * Math.min(1, pr.prog / TUNING.PRISON_TIME));
          C.stroke();
        }
      }
    }

    for (const tp of s.traps) {
      if (!tp.armed) continue;
      C.strokeStyle = '#9a9aa6';
      C.lineWidth = 1.5;
      C.beginPath();
      C.arc(tp.x, tp.y, 6, 0, 7);
      C.stroke();
      C.fillStyle = '#c9c9c9';
      for (let i = 0; i < 4; i++) {
        const an = i * 1.57 + 0.78;
        C.fillRect(tp.x + Math.cos(an) * 6 - 1, tp.y + Math.sin(an) * 6 - 1, 2.5, 2.5);
      }
    }

    drawDragon(s, t, a);
    for (const g of s.guards) if (s.revealed[tileOf(g.x, g.y)]) drawGuard(g, t, a);
    for (const u of s.units) drawUnit(s, u, t, a);

    for (const te of s.tele) {
      C.globalAlpha = 0.65;
      C.strokeStyle = '#ff9c3c';
      C.lineWidth = 2;
      C.setLineDash([5, 4]);
      C.beginPath();
      C.arc(te.x, te.y, TUNING.BREATH_R * T, 0, 7);
      C.stroke();
      C.setLineDash([]);
      C.globalAlpha = 1;
    }

    for (const f of s.fx) {
      const al = Math.max(0, f.l / f.l0);
      if (f.k === 'slash') {
        C.globalAlpha = al;
        C.strokeStyle = '#fff';
        C.lineWidth = 1.5;
        C.beginPath();
        C.moveTo(f.x - 5, f.y - 5);
        C.lineTo(f.x + 5, f.y + 5);
        C.stroke();
        C.globalAlpha = 1;
      } else if (f.k === 'heal') {
        C.globalAlpha = al * 0.8;
        C.fillStyle = '#fff8d0';
        C.fillRect(f.x - 1, f.y - 14 - (1 - al) * 8, 3, 3);
        C.globalAlpha = 1;
      } else if (f.k === 'arrow') {
        C.globalAlpha = al;
        C.strokeStyle = f.c;
        C.lineWidth = 1.5;
        C.beginPath();
        C.moveTo(f.x1, f.y1);
        C.lineTo(f.x2, f.y2);
        C.stroke();
        C.globalAlpha = 1;
      } else if (f.k === 'blast') {
        C.globalAlpha = al;
        C.fillStyle = 'rgba(255,110,60,.5)';
        C.beginPath();
        C.arc(f.x, f.y, TUNING.BREATH_R * T * (1 - al * 0.5), 0, 7);
        C.fill();
        C.strokeStyle = '#ffb070';
        C.lineWidth = 3;
        C.beginPath();
        C.arc(f.x, f.y, TUNING.BREATH_R * T * (1.2 - al), 0, 7);
        C.stroke();
        C.globalAlpha = 1;
      } else if (f.k === 'burst') {
        C.globalAlpha = al;
        C.fillStyle = 'rgba(255,140,60,.5)';
        C.beginPath();
        C.arc(f.x, f.y, (1 - al) * 1.3 * T, 0, 7);
        C.fill();
        C.globalAlpha = 1;
      } else if (f.k === 'slam') {
        C.globalAlpha = al;
        C.strokeStyle = '#d8e2d0';
        C.lineWidth = 3;
        C.beginPath();
        C.arc(f.x, f.y, (1 - al) * 1.7 * T, 0, 7);
        C.stroke();
        C.globalAlpha = 1;
      } else if (f.k === 'boom') {
        C.globalAlpha = al;
        C.strokeStyle = '#ffd75e';
        C.lineWidth = 2;
        C.beginPath();
        C.arc(f.x, f.y, (1 - al) * 16 + 3, 0, 7);
        C.stroke();
        C.globalAlpha = 1;
      } else if (f.k === 'ember') {
        C.globalAlpha = al;
        C.fillStyle = '#ff9c3c';
        C.fillRect(f.x, f.y - (1 - al) * 8, 3, 3);
        C.globalAlpha = 1;
      } else if (f.k === 'smoke') {
        C.globalAlpha = al * 0.6;
        C.fillStyle = '#8a9a8c';
        C.beginPath();
        C.arc(f.x, f.y - (1 - al) * 10, (1 - al) * 18 + 6, 0, 7);
        C.fill();
        C.globalAlpha = 1;
      } else if (f.k === 'txt') {
        C.globalAlpha = Math.min(1, al * 1.6);
        C.fillStyle = f.c || '#fff';
        C.font = 'bold ' + (f.s || 11) + 'px Consolas,monospace';
        C.textAlign = 'center';
        C.fillText(f.txt, f.x, f.y - (1 - al) * 16);
        C.textAlign = 'left';
        C.globalAlpha = 1;
      }
    }

    if (s.cmd && s.cmdT > 0) {
      C.globalAlpha = Math.min(1, s.cmdT);
      C.strokeStyle = '#8affc0';
      C.lineWidth = 2;
      C.beginPath();
      C.arc(s.cmd.x * T + T / 2, s.cmd.y * T + T / 2, 8 + Math.sin(t * 8) * 2, 0, 7);
      C.stroke();
      C.globalAlpha = 1;
    }

    /* fog */
    C.fillStyle = 'rgba(3,6,4,.94)';
    for (let y = 0; y < TR; y++) {
      for (let x = 0; x < TC; x++) if (!s.revealed[gi(x, y)]) C.fillRect(x * T, y * T, T, T);
    }
    if (s.dragon.awake) drawDragon(s, t, a);

    /* compass */
    if (s.units.length) {
      const L2 = s.units[0] as Unit;
      const lx0 = ix(L2, a);
      const ly0 = iy(L2, a);
      const hh2 = s.hoard;
      const toExit = s.dragon.awake || hh2.pool < hh2.pool0 * TUNING.LOW_HOARD_FRAC;
      const tx2 = toExit ? s.exitCtr.x : (hh2.x0 + 1.5) * T;
      const ty2 = toExit ? s.exitCtr.y : (hh2.y0 + 2) * T;
      if (dist(lx0, ly0, tx2, ty2) > 60) {
        const ang = Math.atan2(ty2 - ly0, tx2 - lx0);
        const ax = lx0 + Math.cos(ang) * 42;
        const ay = ly0 + Math.sin(ang) * 42;
        C.save();
        C.translate(ax, ay);
        C.rotate(ang);
        C.fillStyle = toExit ? 'rgba(61,220,132,.95)' : 'rgba(255,215,94,.95)';
        C.beginPath();
        C.moveTo(12, 0);
        C.lineTo(-6, -7);
        C.lineTo(-2, 0);
        C.lineTo(-6, 7);
        C.closePath();
        C.fill();
        C.restore();
        const lx = lx0 + Math.cos(ang) * 64;
        const ly = ly0 + Math.sin(ang) * 64;
        C.font = 'bold 10px Consolas,monospace';
        C.textAlign = 'center';
        C.fillStyle = 'rgba(4,10,7,.85)';
        C.fillText(toExit ? 'EXIT' : 'HOARD', lx + 1, ly + 4);
        C.fillStyle = toExit ? 'rgba(61,220,132,.95)' : 'rgba(255,215,94,.95)';
        C.fillText(toExit ? 'EXIT' : 'HOARD', lx, ly + 3);
        C.textAlign = 'left';
      }
    }

    C.restore();

    /* ---- screen space ----
       Everything above is the lair, drawn in world units under the camera.
       Everything below is furniture painted on the glass: it belongs to the
       viewport, not to the world, and drawing it in world units meant the
       vignette, the strip and the banner all scrolled away with the map the
       moment the camera moved. */
    C.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sw = canvas.clientWidth || W;
    const sh = canvas.clientHeight || H;

    /* wake tension vignette */
    if (s.wake >= TUNING.HEARTBEAT_WAKE && !s.dragon.awake) {
      const vv = (s.wake - TUNING.HEARTBEAT_WAKE) / 30;
      const pulse = calm ? 0 : 0.03 * Math.sin(t * 4);
      C.fillStyle = 'rgba(255,60,60,' + (0.05 + 0.05 * vv + pulse) + ')';
      C.fillRect(0, 0, sw, sh);
    }

    /* top strip. Skipped once the view is a window rather than the whole lair:
       it is a band across the top of a screen the player is already short of,
       and every word of it is in the HUD beside the canvas at a legible size. */
    if (!tight) {
      C.fillStyle = 'rgba(4,10,7,.8)';
      C.fillRect(0, 0, sw, 24);
      C.fillStyle = '#1e3427';
      C.fillRect(0, 24, sw, 1);
      C.font = 'bold 12px Consolas,monospace';
      C.textAlign = 'left';
      if (s.dragon.awake) {
        C.fillStyle = '#ff9aa6';
        C.fillText(huntLine(), 10, 16);
      } else {
        C.fillStyle = s.creep ? '#8fd4ff' : '#8affc0';
        C.fillText(
          (s.creep ? '👣 CREEPING · ' : '🗝 ') +
            s.mod.n +
            ' · WAKE ' +
            Math.floor(s.wake) +
            '% · ' +
            (s.creep ? 'slow feet, quiet feet' : 'greed feeds the beast'),
          10,
          16,
        );
      }
    }

    if (s.banner) {
      const al = Math.min(1, s.banner.l / 0.4);
      if (!calm) {
        C.fillStyle = 'rgba(255,70,80,' + 0.12 * (s.banner.l / s.banner.l0) + ')';
        C.fillRect(0, 0, sw, sh);
      }
      C.textAlign = 'center';
      // the banner is set for a 768px stage; on a phone it has to give
      const bs = Math.min(1, sw / 560);
      C.font = `${Math.round(44 * bs)}px "Pirata One",Georgia,serif`;
      C.fillStyle = 'rgba(6,10,8,' + 0.9 * al + ')';
      C.fillText(s.banner.t1, sw / 2 + 2, sh / 2 - 2);
      C.fillStyle = 'rgba(255,215,94,' + al + ')';
      C.fillText(s.banner.t1, sw / 2, sh / 2 - 4);
      C.font = `${Math.round(16 * bs)}px "Pirata One",Georgia,serif`;
      C.fillStyle = 'rgba(213,230,218,' + 0.95 * al + ')';
      C.fillText(s.banner.t2, sw / 2, sh / 2 + 24 * bs);
      C.textAlign = 'left';
    }
  }

  return { render, buildRockCache, canvas };
}
