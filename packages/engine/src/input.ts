/**
 * Input — joystick, WASD/arrows, click-to-move, item hotkeys.
 *
 * Produces one `InputFrame` per read. The frame is the whole of the player's
 * intent for a tick, which is exactly what a Phase 4 replay log records.
 */

import { H, T, TC, TR, W, type ItemKey } from './defs.js';
import { clamp } from './util.js';
import type { InputFrame, RunCommand } from './types.js';

export interface InputOptions {
  canvas: HTMLCanvasElement;
  /** joystick base + knob; omit on desktop-only mounts */
  stick?: HTMLElement | null;
  knob?: HTMLElement | null;
  /** key/pointer events are ignored while this returns false */
  enabled?: () => boolean;
}

export interface InputController {
  /** Current intent; queued commands are handed over and cleared. */
  read(): InputFrame;
  /** Queue a command from UI chrome (item buttons, EXTRACT button). */
  push(cmd: RunCommand): void;
  dispose(): void;
}

const STICK_MAX = 36;

export function createInput(opts: InputOptions): InputController {
  const { canvas } = opts;
  const enabled = opts.enabled ?? (() => true);

  const keys: Record<string, boolean> = {};
  const stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
  let queue: RunCommand[] = [];

  const push = (cmd: RunCommand): void => {
    queue.push(cmd);
  };

  /* ---- pointer: click / tap to send the crew ---- */
  const onContextMenu = (e: Event): void => e.preventDefault();
  const onCanvasDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!enabled()) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const y = (e.clientY - r.top) * (H / r.height);
    push({ c: 'move', x: clamp((x / T) | 0, 0, TC - 1), y: clamp((y / T) | 0, 0, TR - 1) });
  };

  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('pointerdown', onCanvasDown);

  /* ---- keyboard ---- */
  const ITEM_KEYS: Record<string, ItemKey> = { '1': 'smoke', '2': 'lull', '3': 'trap' };
  const onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (!enabled()) return;
    if (k === 'e') push({ c: 'extract' });
    const item = ITEM_KEYS[k];
    if (item) push({ c: 'item', k: item });
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys[e.key.toLowerCase()] = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  /* ---- virtual joystick ---- */
  const stEl = opts.stick ?? null;
  const knob = opts.knob ?? null;

  const stMove = (e: PointerEvent): void => {
    let dx = e.clientX - stick.bx;
    let dy = e.clientY - stick.by;
    const m = Math.hypot(dx, dy);
    if (m > STICK_MAX) {
      dx = (dx / m) * STICK_MAX;
      dy = (dy / m) * STICK_MAX;
    }
    stick.dx = dx / STICK_MAX;
    stick.dy = dy / STICK_MAX;
    if (knob) knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const onStickDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!stEl) return;
    try {
      stEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore — capture is a nicety */
    }
    stick.active = true;
    stick.id = e.pointerId;
    const r = stEl.getBoundingClientRect();
    stick.bx = r.left + r.width / 2;
    stick.by = r.top + r.height / 2;
    stMove(e);
  };
  const onStickMove = (e: PointerEvent): void => {
    if (stick.active && e.pointerId === stick.id) stMove(e);
  };
  const onStickEnd = (e: PointerEvent): void => {
    if (stick.active && e.pointerId === stick.id) {
      stick.active = false;
      stick.dx = 0;
      stick.dy = 0;
      if (knob) knob.style.transform = 'translate(0,0)';
    }
  };
  if (stEl) {
    stEl.addEventListener('pointerdown', onStickDown);
    stEl.addEventListener('pointermove', onStickMove);
    stEl.addEventListener('pointerup', onStickEnd);
    stEl.addEventListener('pointercancel', onStickEnd);
    stEl.addEventListener('lostpointercapture', onStickEnd);
  }

  /** The prototype's `moveVec()`: stick wins when pushed, else WASD/arrows. */
  function moveVec(): { x: number; y: number; m: number } {
    let x = 0;
    let y = 0;
    if (stick.active && Math.abs(stick.dx) + Math.abs(stick.dy) > 0.1) {
      x = stick.dx;
      y = stick.dy;
    } else {
      x = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
      y = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
    }
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m, m: Math.min(1, m) } : { x: 0, y: 0, m: 0 };
  }

  return {
    read(): InputFrame {
      const mv = enabled() ? moveVec() : { x: 0, y: 0, m: 0 };
      const commands = queue;
      queue = [];
      return { mx: mv.x, my: mv.y, mm: mv.m, commands };
    },
    push,
    dispose(): void {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (stEl) {
        stEl.removeEventListener('pointerdown', onStickDown);
        stEl.removeEventListener('pointermove', onStickMove);
        stEl.removeEventListener('pointerup', onStickEnd);
        stEl.removeEventListener('pointercancel', onStickEnd);
        stEl.removeEventListener('lostpointercapture', onStickEnd);
      }
    },
  };
}
