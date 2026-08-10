/**
 * Audio — the prototype's one-oscillator `snd()`, driven by cues the sim emits.
 *
 * The simulation never makes a sound itself; it queues `SoundCue`s and the host
 * drains them. `delay` replaces the prototype's `setTimeout` chords.
 */

import type { SoundCue } from './types.js';

export interface Audio {
  play(cue: SoundCue): void;
  playAll(cues: readonly SoundCue[]): void;
  /** Browsers start the context suspended — call once from a user gesture. */
  resume(): void;
  muted: boolean;
}

export function createAudio(): Audio {
  let AC: AudioContext | null = null;

  const ctx = (): AudioContext | null => {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      AC = AC ?? new Ctor();
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
      if (!ac) return;
      const d = cue.d ?? 0.07;
      const type = cue.type ?? 'square';
      const v = cue.v ?? 0.05;
      try {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.value = cue.f;
        if (cue.slide) o.frequency.linearRampToValueAtTime(Math.max(25, cue.f + cue.slide), ac.currentTime + d);
        g.gain.value = v;
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
        o.connect(g);
        g.connect(ac.destination);
        o.start();
        o.stop(ac.currentTime + d);
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
