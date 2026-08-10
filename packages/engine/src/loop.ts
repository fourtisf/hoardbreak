/**
 * Fixed-timestep game loop (handoff §4).
 *
 * The prototype ran the sim on the rAF delta. That is fine to play and
 * impossible to verify: two machines produce two different runs from the same
 * seed. Here the sim always advances in whole `SIM_DT` ticks and the renderer
 * interpolates by the leftover, which is what makes replay verification
 * possible in Phase 4 without changing a line of gameplay code.
 */

import { SIM_DT } from './defs.js';
import { step } from './sim.js';
import type { InputFrame, RunState } from './types.js';

/** Never simulate more than this many ticks in one frame (death-spiral guard). */
const MAX_STEPS = 5;
/** Ignore frame deltas longer than this (tab was backgrounded). */
const MAX_FRAME = 0.25;

export interface LoopOptions {
  /** the run to advance, or null to idle (menus, run-over card) */
  state: () => RunState | null;
  /** player intent for the next tick */
  input: () => InputFrame;
  /** true while the sim should be paused but still rendered (e.g. tutorial) */
  paused?: () => boolean;
  /** called after every simulated tick — drain sim output here */
  afterStep?: (s: RunState) => void;
  /** called once per frame; `alpha` is the interpolation factor in [0, 1] */
  render?: (s: RunState, alpha: number, t: number, dt: number) => void;
  /** called once per frame even when there is no run (landing animation) */
  idle?: (t: number, dt: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** ticks simulated since start — handy in tests and the debug handle */
  readonly ticks: number;
}

export function createLoop(opts: LoopOptions): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let ticks = 0;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const t = now / 1000;

    const s = opts.state();
    if (!s) {
      acc = 0;
      opts.idle?.(t, dt);
      return;
    }

    if (opts.paused?.()) {
      acc = 0;
    } else {
      acc += dt;
      let n = 0;
      while (acc >= SIM_DT && n < MAX_STEPS) {
        step(s, opts.input());
        opts.afterStep?.(s);
        acc -= SIM_DT;
        n++;
        ticks++;
        if (s.over) {
          acc = 0;
          break;
        }
      }
      // ran out of budget — drop the backlog rather than spiral
      if (acc >= SIM_DT) acc = 0;
    }

    const alpha = acc / SIM_DT;
    opts.render?.(s, alpha < 0 ? 0 : alpha > 1 ? 1 : alpha, t, dt);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    get ticks() {
      return ticks;
    },
  };
}
