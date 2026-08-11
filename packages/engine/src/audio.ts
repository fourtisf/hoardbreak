/**
 * Audio — the prototype's one-oscillator `snd()`, driven by cues the sim emits.
 *
 * The simulation never makes a sound itself; it queues `SoundCue`s and the host
 * drains them. `delay` replaces the prototype's `setTimeout` chords.
 *
 * Three things sit between a cue and the speakers, and each fixes something you
 * could hear in the prototype:
 *
 *  - **An attack ramp.** Setting `gain.value` and immediately ramping down makes
 *    the signal jump from silence to full amplitude in one sample. That
 *    discontinuity is a click, and it fired on *every single note*. A 4 ms fade
 *    in costs nothing and removes it.
 *  - **A limiter.** Every voice used to connect straight to `destination`, so a
 *    busy moment — four thieves swinging while a guard shouts and coins land —
 *    summed past 1.0 and clipped into a crackle. A compressor on the master bus
 *    catches the peaks instead.
 *  - **A voice cap.** Past a couple of dozen simultaneous oscillators nothing is
 *    audible as itself anyway; it is just loud. Dropping the overflow keeps a
 *    chaotic second legible.
 */

import type { SoundCue } from './types.js';

export interface Audio {
  play(cue: SoundCue): void;
  playAll(cues: readonly SoundCue[]): void;
  /** Browsers start the context suspended — call once from a user gesture. */
  resume(): void;
  muted: boolean;
}

/** Rise time. Long enough to kill the click, short enough to still read as a hit. */
const ATTACK = 0.004;
/** Simultaneous oscillators past which extra cues are dropped rather than piled on. */
const MAX_VOICES = 22;

export function createAudio(): Audio {
  let AC: AudioContext | null = null;
  let master: GainNode | null = null;
  let voices = 0;

  const ctx = (): AudioContext | null => {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!AC) {
        AC = new Ctor();
        const bus = AC.createGain();
        bus.gain.value = 1;
        // a limiter, not an effect: hold the sum of many voices under clipping
        const comp = AC.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 6;
        comp.ratio.value = 12;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;
        bus.connect(comp);
        comp.connect(AC.destination);
        master = bus;
      }
      return AC;
    } catch {
      return null;
    }
  };

  const api: Audio = {
    muted: false,
    play(cue: SoundCue): void {
      if (api.muted) return;
      const ac = ctx();
      if (!ac || !master) return;
      if (voices >= MAX_VOICES) return;
      const d = cue.d ?? 0.07;
      const type = cue.type ?? 'square';
      const v = cue.v ?? 0.05;
      try {
        const t0 = ac.currentTime;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(cue.f, t0);
        if (cue.slide) o.frequency.linearRampToValueAtTime(Math.max(25, cue.f + cue.slide), t0 + d);

        // silence → level → silence. The first ramp is what removes the click.
        const attack = Math.min(ATTACK, d / 2);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

        o.connect(g);
        g.connect(master);
        voices++;
        o.onended = (): void => {
          voices--;
          try {
            g.disconnect();
          } catch {
            /* already torn down */
          }
        };
        o.start(t0);
        o.stop(t0 + d);
      } catch {
        /* audio is a nicety; never let it break a run */
      }
    },
    playAll(cues: readonly SoundCue[]): void {
      for (const c of cues) {
        if (c.delay) setTimeout(() => api.play(c), c.delay);
        else api.play(c);
      }
    },
    resume(): void {
      const ac = ctx();
      if (ac && ac.state === 'suspended') void ac.resume();
    },
  };

  return api;
}
