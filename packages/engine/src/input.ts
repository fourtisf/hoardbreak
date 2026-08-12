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
  /**
   * The camera, if there is one.
   *
   * Read at the moment of the tap, from the same function the renderer draws
   * with. If these two ever disagree the crew walks somewhere other than where
   * the player pointed — a bug that feels like the game ignoring you.
   */
  view?: () => { k: number; ox: number; oy: number };
  /** key/pointer events are ignored while this returns false */
  enabled?: () => boolean;
}

export interface InputController {
  /** Current intent; queued commands are handed over and cleared. */
  read(): InputFrame;
  /** Queue a command from UI chrome (item buttons, EXTRACT button). */
  push(cmd: RunCommand): void;
  /** Latch creep on/off — the mobile toggle. Shift overrides it while held. */
  setCreep(on: boolean): void;
  /**
   * Aim the next tap at one thief, or at the whole crew with `null`.
   *
   * Cleared after the tap lands: a targeting mode the player can forget they
   * are in is a mode that loses runs.
   */
  setSolo(tid: number | null): void;
  isCreeping(): boolean;
  dispose(): void;
}

const STICK_MAX = 36;

export function createInput(opts: InputOptions): InputController {
  const { canvas } = opts;
  const enabled = opts.enabled ?? (() => true);

  const keys: Record<string, boolean> = {};
  const stick = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 };
  let queue: RunCommand[] = [];
  // creep is held on desktop (Shift) and latched on touch (the CREEP button)
  let creepLatched = false;
  let solo: number | null = null;

  const push = (cmd: RunCommand): void => {
    queue.push(cmd);
  };

  /* ---- pointer: click / tap to send the crew ----
   *
   * Issued on *up*, not down, and only if the pointer barely moved. Firing on
   * down meant every drag that began on the canvas — including a thumb that
   * reached for the joystick and missed — flung the crew at wherever the finger
   * happened to land first. On a phone that is most of them.
   */
  const TAP_SLOP = 12; // px of travel still counted as a tap
  const TAP_MS = 700; // longer than this is a considered press, not a tap
  const tap = { id: -1, x: 0, y: 0, t: 0 };

  const onContextMenu = (e: Event): void => e.preventDefault();
  const onCanvasDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (!enabled()) return;
    tap.id = e.pointerId;
    tap.x = e.clientX;
    tap.y = e.clientY;
    tap.t = performance.now();
  };
  const onCanvasUp = (e: PointerEvent): void => {
    if (e.pointerId !== tap.id) return;
    tap.id = -1;
    if (!enabled()) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) return;
    if (performance.now() - tap.t > TAP_MS) return;
    const r = canvas.getBoundingClientRect();
    const v = opts.view?.() ?? { k: r.width / W, ox: 0, oy: 0 };
    // screen → world, through the camera the renderer used for this frame
    const x = v.ox + (e.clientX - r.left) / v.k;
    const y = v.oy + (e.clientY - r.top) / v.k;
    const cmd: RunCommand =
      solo === null
        ? { c: 'move', x: clamp((x / T) | 0, 0, TC - 1), y: clamp((y / T) | 0, 0, TR - 1) }
        : { c: 'move', x: clamp((x / T) | 0, 0, TC - 1), y: clamp((y / T) | 0, 0, TR - 1), tid: solo };
    solo = null;
    push(cmd);
  };
  const onCanvasCancel = (e: PointerEvent): void => {
    if (e.pointerId === tap.id) tap.id = -1;
  };

  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('pointerdown', onCanvasDown);
  canvas.addEventListener('pointerup', onCanvasUp);
  canvas.addEventListener('pointercancel', onCanvasCancel);

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
  // a Shift held down when the window loses focus would otherwise stick
  const onBlur = (): void => {
    for (const k of Object.keys(keys)) keys[k] = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

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
  /**
   * Take the stick where the thumb landed.
   *
   * A joystick pinned to one corner asks the player to look away from the lair
   * and aim for a circle. Re-basing it under the finger means the first touch is
   * always dead centre, which is how every phone game that feels good does it.
   * The element still snaps back to its resting place on release, so the
   * affordance stays where a new player expects to find it.
   */
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
    if (e.pointerType === 'touch') {
      // `left`/`top` are relative to the offset parent, not the viewport — using
      // the raw clientY here dropped the stick a header's height below the thumb
      const host = (stEl.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      const ox = host?.left ?? 0;
      const oy = host?.top ?? 0;
      stEl.style.left = `${e.clientX - ox - r.width / 2}px`;
      stEl.style.top = `${e.clientY - oy - r.height / 2}px`;
      stEl.style.bottom = 'auto';
      stick.bx = e.clientX;
      stick.by = e.clientY;
    } else {
      stick.bx = r.left + r.width / 2;
      stick.by = r.top + r.height / 2;
    }
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
      // back to its resting corner, so it is where a new player looks for it
      if (stEl && e.pointerType === 'touch') {
        stEl.style.left = '';
        stEl.style.top = '';
        stEl.style.bottom = '';
      }
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

  const creeping = (): boolean => creepLatched || keys['shift'] === true;

  return {
    read(): InputFrame {
      const mv = enabled() ? moveVec() : { x: 0, y: 0, m: 0 };
      const commands = queue;
      queue = [];
      return { mx: mv.x, my: mv.y, mm: mv.m, creep: creeping(), commands };
    },
    push,
    setSolo(tid: number | null): void {
      solo = tid;
    },
    setCreep(on: boolean): void {
      creepLatched = on;
    },
    isCreeping: creeping,
    dispose(): void {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      canvas.removeEventListener('pointerup', onCanvasUp);
      canvas.removeEventListener('pointercancel', onCanvasCancel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
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
