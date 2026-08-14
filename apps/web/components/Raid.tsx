'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GD,
  H,
  ITEMS,
  ITEM_KEYS,
  RELICS,
  RELIC_KEYS,
  T,
  TUNING,
  UD,
  W,
  createAudio,
  createInput,
  createLoop,
  createRenderer,
  createRun,
  crewFocus,
  dailySeed,
  drainOutput,
  extractReady,
  fmt,
  modFor,
  todayUTC,
  viewFor,
  type CrewKind,
  type FeedLine,
  type InputController,
  type ItemKey,
  type RelicKey,
  type RunState,
} from '@dragonjob/engine';
import {
  applyRunResult,
  huntLines,
  markPlayed,
  payRetainer,
  shareText,
  slayerReadiness,
  snapshotRunMeta,
  verdictFor,
} from '@dragonjob/shared';
import type { Readiness } from '@dragonjob/shared';
import { abandonRun, snapshotJSON } from '@dragonjob/engine';
import { getMeta, markTutorialSeen, mutate, setLastRun, tutorialSeen } from '@/lib/store';
import { disarmRaid, raidArmed } from '@/lib/entry';
import { toast } from '@/lib/toast';
import { postRun } from '@/lib/board';
import SpriteCanvas from './SpriteCanvas';
import Toast from './Toast';

interface SquadRow {
  tid: number;
  name: string;
  kind: CrewKind;
  lv: number;
}

interface OverCard {
  title: string;
  subtitle: string;
  success: boolean;
  loot: number;
  stolenPct: number;
  guardsSlain: number;
  crewLost: number;
  tok: number;
  nextDepth: number;
  /** the pasteable result card */
  share: string;
}

/** 1st, 2nd, 3rd… — a rank reads as a placing, a bare number reads as a score. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Only touch the DOM when the text actually changed (the prototype's `setT`). */
const setT = (el: HTMLElement | null, v: string): void => {
  if (el && el.textContent !== v) el.textContent = v;
};

/**
 * Is anyone actually swinging right now?
 *
 * `u.tgt` alone is not enough — a unit keeps a target while it is still walking
 * over to it, so trusting it would announce a fight that has not started. The
 * blow only lands once the guard is inside the class's reach, which is exactly
 * the condition sim.ts uses before it deals damage.
 */
function swingingAt(s: RunState): { name: string; foe: string } | null {
  for (const u of s.units) {
    if (u.tgt === null) continue;
    const g = s.guards.find((q) => q.gid === u.tgt);
    if (!g) continue;
    if (Math.hypot(u.x - g.x, u.y - g.y) <= UD[u.k].range * T) return { name: u.name, foe: GD[g.k].n };
  }
  return null;
}

/**
 * What an awake wyrm means for the crew that is standing in front of it.
 *
 * The game used to shout "RUN" from three places the moment it opened its eyes
 * — the strip across the canvas, the hint bar and the wake panel — while the
 * only honest reading sat quietly in the wyrm's own box saying "your crew can
 * take it". A player being told two opposite things at once concludes the fight
 * is never allowed, which is not true and is not the design: the wyrm is a wall
 * you eventually break, and the game has to say which side of it you are on.
 *
 * All three lines now come from the same verdict `slayerReadiness` computes.
 */
type Grade = Readiness['grade'];

/**
 * The hint bar under the canvas, rewritten every frame.
 *
 * The prototype showed one static control reminder forever. A player who has
 * never seen the game does not need to be told about hotkeys — they need to be
 * told what to do *next*. First match wins, most urgent first.
 */
/**
 * Does this player have a keyboard?
 *
 * The coach line told phone players to "hold SHIFT to creep" and to "press E"
 * — instructions for hardware they are not holding, in the one strip of text
 * the game uses to teach itself. `pointer: coarse` is the honest question: not
 * "is this a phone" but "is this a finger", which is what actually decides
 * whether a key exists to press.
 */
const hasKeys = (): boolean =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : !window.matchMedia('(pointer: coarse)').matches;

function coachFor(s: RunState, inZoneCount: number, grade: Grade, keys: boolean): string {
  // the roof is coming down: nothing else is the question any more
  if (s.collapseT > 0)
    return keys
      ? '⛏ The roof is coming down — get everyone to the exit and press E'
      : '⛏ The roof is coming down — get everyone to the exit and EXTRACT';
  // the wyrm is up and its Heart lies bare: the fork the whole climax is about
  if (s.heartState === 'exposed')
    return keys
      ? `🐉 It hunts you now — RUN for the exit, or SEIZE the Heart: ×${TUNING.HEART_MUL} loot and it chases you`
      : `🐉 It hunts you now — RUN for the exit, or tap SEIZE: ×${TUNING.HEART_MUL} loot and it chases you`;
  if (s.dragon.awake) return huntLines(grade).hint;
  // the lockdown outranks everything short of the wyrm: the room you are in
  // stopped being the problem the moment they went to stand on the door
  if (s.sealed && !s.units.some((u) => u.ord))
    return '⛔ The door is held — send one thief ahead to break the line, or fight through together';
  if (s.sealed) return '⛔ The door is held — your forward thief buys the rest of the crew a way through';
  if (s.relicOffers.length) return '◆ Two relics — walk into the one you want, the other crumbles';
  // an actual fight outranks a mere sighting: this is the moment a new player
  // asks "why isn't my crew attacking?", and the answer is that they already are
  const swing = swingingAt(s);
  if (swing) {
    const a = /^[aeiou]/i.test(swing.foe) ? 'an' : 'a';
    return `⚔ ${swing.name} is fighting ${a} ${swing.foe} — the crew swings on its own, there is no attack button`;
  }
  if (inZoneCount > 0 && inZoneCount === s.units.length && (s.wake >= 55 || s.hoard.pool < s.hoard.pool0 * 0.5))
    return keys ? '⚑ Everyone is on the exit — press E to bank it' : '⚑ Everyone is on the exit — tap EXTRACT';
  if (s.wake >= 75) return '⚠ It stirs, and guards are waking. Take what you have and go.';
  if (s.guards.some((g) => g.alert))
    return keys
      ? '! Spotted — the crew fights on its own · [1] Smoke to break away'
      : '! Spotted — the crew fights on its own · tap Smoke to break away';
  const onGold = s.units.filter((u) => {
    const gx = (u.x / 24) | 0;
    const gy = (u.y / 24) | 0;
    return gx >= s.hoard.x0 && gx <= s.hoard.x1 && gy >= s.hoard.y0 && gy <= s.hoard.y1;
  });
  if (onGold.some((u) => Math.hypot(u.x - s.dragon.x, u.y - s.dragon.y) <= TUNING.DEEP_R * 24))
    return '🔥 Deep gold — it pays double and wakes it faster. Do not fall in love with it.';
  if (onGold.length)
    return '💰 Siphoning — the ring under the wyrm pays double, if you dare stand in it';
  if (s.prison && !s.prison.done && s.revealed[((s.prison.y / 24) | 0) * 32 + ((s.prison.x / 24) | 0)])
    return `🗝 ${s.prison.thief.name} is in that cage — stand close to cut them loose`;
  if (s.hoard.pool < s.hoard.pool0 * 0.62)
    return '⚠ Past half the hoard and every guard turns for the door — take it knowing that';
  return keys
    ? '🕹 Follow the golden arrow · hold SHIFT to creep — slower, but they will not see you'
    : '🕹 Follow the golden arrow · tap CREEP — slower, but they will not see you';
}

const wakeHintFor = (s: RunState, grade: Grade): string =>
  s.dragon.awake
    ? huntLines(grade).wake
    : s.stage >= 2
      ? 'It stirs. Guards are waking. Leave soon.'
      : s.stage >= 1
        ? 'One eye is open. It breathes fire in its sleep.'
        : 'Combat, chests and siphoning stir the beast.';

export default function Raid() {
  const router = useRouter();

  const cvRef = useRef<HTMLCanvasElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const hDepth = useRef<HTMLElement>(null);
  const hLoot = useRef<HTMLElement>(null);
  const hCrew = useRef<HTMLElement>(null);
  const wakePct = useRef<HTMLElement>(null);
  const wakeFill = useRef<HTMLElement>(null);
  const wakeHint = useRef<HTMLDivElement>(null);
  const wyrmBox = useRef<HTMLDivElement>(null);
  const wyrmPct = useRef<HTMLElement>(null);
  const wyrmFill = useRef<HTMLElement>(null);
  const wyrmCall = useRef<HTMLDivElement>(null);
  const sLoot = useRef<HTMLElement>(null);
  const hintBar = useRef<HTMLDivElement>(null);
  const stolenPct = useRef<HTMLElement>(null);
  const stolenFill = useRef<HTMLElement>(null);
  const stolenHint = useRef<HTMLDivElement>(null);
  const extractBtn = useRef<HTMLButtonElement>(null);
  const seizeBtn = useRef<HTMLButtonElement>(null);
  const hpBars = useRef(new Map<number, HTMLElement>());

  const inputRef = useRef<InputController | null>(null);
  const pausedRef = useRef(true);

  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [items, setItems] = useState<Record<ItemKey, number>>({ smoke: 0, lull: 0, trap: 0 });
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [over, setOver] = useState<OverCard | null>(null);
  const [tut, setTut] = useState(() => !tutorialSeen());
  const [menu, setMenu] = useState(false);
  const [relics, setRelics] = useState<RelicKey[]>([]);
  const [creep, setCreep] = useState(false);
  const [muted, setMuted] = useState(() => getMeta().muted);
  /**
   * Whose turn it is to be given an order.
   *
   * null = the whole crew, which is how the game has always worked and stays
   * the default. Picking one thief makes the next tap on the lair a posting for
   * them alone, then hands the pointer back to the crew — a mode you can forget
   * you are in is a mode that loses runs.
   */
  const [picked, setPicked] = useState<number | null>(null);
  /**
   * Who is currently standing on a posting.
   *
   * Kept apart from `squad` because it changes on a tap, not on a join or a
   * death — and because a posted thief with no way back is a thief you lose.
   */
  const [held, setHeld] = useState<readonly number[]>([]);
  /**
   * Whether this player has a keyboard, for the copy that would otherwise name
   * keys they are not holding. State rather than a ref because the tutorial and
   * the pause card are rendered React, not painted per frame — and it starts
   * `true` so the server and the first client paint agree.
   */
  const [keys, setKeys] = useState(true);
  useEffect(() => {
    setKeys(hasKeys());
  }, []);
  const audioRef = useRef<{ muted: boolean } | null>(null);
  const runRef = useRef<RunState | null>(null);
  const readyRef = useRef<Readiness | null>(null);
  const pickedRef = useRef<number | null>(null);
  const felt = useRef({ seen: false, stirs: false, woke: false, heart: false });
  // the per-frame coach line reads this rather than `keys` so it never touches
  // React state from inside the render loop
  const keysRef = useRef(true);
  keysRef.current = keys;

  pausedRef.current = tut || menu || over !== null;
  pickedRef.current = picked;

  /**
   * A short buzz on the beats that matter.
   *
   * Phones are held, not watched — a player looking at the exit tiles will feel
   * the wyrm wake before they see the banner. Ignored on desktop, refused by
   * iOS Safari, and silenced with the sound: someone who muted the game did not
   * ask to be poked either.
   */
  const buzz = useCallback((pattern: number | number[]): void => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (getMeta().muted) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* a nicety; never let it break a run */
    }
  }, []);

  /**
   * Hand the card to whatever the device is best at.
   *
   * The native sheet is the right answer on a phone — it reaches the app the
   * player actually posts from. Everywhere else, and whenever the sheet is
   * refused, the clipboard is the reliable fallback. A cancelled share is not a
   * failure and must not report one.
   */
  const doShare = useCallback(async (text: string): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* dismissed, or refused — fall through to the clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Go and tell someone.');
    } catch {
      toast('Could not copy — select the card and copy it by hand.');
    }
  }, []);

  useEffect(() => {
    const canvas = cvRef.current;
    if (!canvas) return;

    // Refreshing /raid, or opening it cold, used to start a brand-new run out of
    // nowhere. A raid is somewhere you walk into — send anyone who arrived any
    // other way back to the front door. Checked before `createRun`, so a bounced
    // load never touches the save.
    if (!raidArmed()) {
      router.replace('/');
      return;
    }

    const meta = getMeta();
    if (meta.crew.length === 0) {
      router.replace('/hideout');
      return;
    }

    /* --- start the run: Phase 1 computes the seed client-side, exactly like
       the prototype. Phase 2 swaps these three lines for POST /runs/start. --- */
    const date = todayUTC();
    const depth = meta.depth;
    // the roster cannot change mid-raid, so the verdict is settled here and
    // every line the game says about the wyrm is drawn from it
    const ready = slayerReadiness(meta, depth);
    const run = createRun({
      seed: dailySeed(date, depth),
      depth,
      mod: modFor(date, depth),
      meta: snapshotRunMeta(meta),
      date,
      wakeCall: huntLines(ready.grade).call,
    });
    // a generated prisoner burns a thief id whether or not anyone frees them
    if (run.freshPrisonerTid !== null) meta.uid = Math.max(meta.uid, run.freshPrisonerTid);
    runRef.current = run;

    readyRef.current = ready;
    // the fallen are gone from the roster by the time the card is built, so
    // their names are taken now, while they are still on it
    const crewAtStart = meta.crew.length;
    const nameOf = new Map(meta.crew.map((t) => [t.tid, t.name]));

    /* ── the camera ──────────────────────────────────────────────────────
     * The lair is a fixed 768×528 surface and every screen used to show all
     * of it, scaled to fit. On a 390px phone that is 49.5%: an 11.9px tile, a
     * 7px thief, unit names under 4px. No amount of layout fixes that — the
     * canvas is width-bound and cannot grow.
     *
     * So a canvas too small to read the whole lair gets a window on it
     * instead, kept on the crew. `viewFor` decides which, from pixels per
     * tile rather than from a guess about the device, so a small desktop
     * window gets the same help and a tablet held sideways does not need it.
     *
     * One `viewRef` feeds both the renderer and the input layer: a tap is
     * mapped back through the exact numbers the frame was drawn with. */
    const viewRef = { current: { k: 1, ox: 0, oy: 0 } };
    const readView = (): { k: number; ox: number; oy: number } => viewRef.current;

    /* The backing store follows the element's real size in device pixels.
       Left at a fixed 768×528 it composited into 1140 device px on a DPR-3
       phone — a 1.484× non-integer upscale forced through nearest-neighbour,
       which makes sprite edges crawl as a thief walks. */
    const fitCanvas = (): void => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        // the context resets on resize, and the smoothing flag with it
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.imageSmoothingEnabled = false;
      }
    };
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(canvas);

    const renderer = createRenderer(canvas, {
      huntLine: () => huntLines(readyRef.current?.grade ?? 'flee').strip,
      view: readView,
    });
    renderer.buildRockCache(run);
    const audio = createAudio();
    audio.muted = getMeta().muted;
    audioRef.current = audio;
    const input = createInput({
      canvas,
      view: readView,
      stick: stickRef.current,
      knob: knobRef.current,
      enabled: () => !pausedRef.current,
    });
    inputRef.current = input;
    input.setSolo(pickedRef.current);

    const unlock = (): void => audio.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu((m) => !m);
    };
    window.addEventListener('keydown', onEsc);

    setT(hDepth.current, String(depth));

    let lastItems = '';
    let lastRelics = 0;
    let lastHeld = '';
    let toldAboutPrisons = false;
    let applied = false;

    const drain = (s: RunState): void => {
      const out = drainOutput(s);
      if (out.sounds.length) audio.playAll(out.sounds);
      if (out.feed.length) setFeed((f) => [...f, ...out.feed].slice(-6));
      for (const m of out.toasts) toast(m);
      // the first death reads as permanent unless somebody says otherwise
      if (!toldAboutPrisons && out.feed.some((f) => f.msg.includes('falls in the dark'))) {
        toldAboutPrisons = true;
        toast('The fallen are not gone — dragon prisons hold them. Go back for them.');
      }
      if (out.squadDirty) {
        setSquad(s.units.map((u) => ({ tid: u.tid, name: u.name, kind: u.k, lv: u.lv })));
        lastHeld = 'reset'; // a death can free a posting; force the chips to re-read
        // don't leave the next tap aimed at someone who just died
        if (pickedRef.current !== null && !s.units.some((u) => u.tid === pickedRef.current)) {
          setPicked(null);
          input.setSolo(null);
        }
      }
      const sig = `${s.items.smoke}/${s.items.lull}/${s.items.trap}`;
      if (sig !== lastItems) {
        lastItems = sig;
        setItems({ ...s.items });
      }
      const held = RELIC_KEYS.filter((k) => s.relics[k]);
      if (held.length !== lastRelics) {
        lastRelics = held.length;
        setRelics(held);
      }
      if (s.over && s.result && !applied) {
        applied = true;
        const r = s.result;
        const payout = mutate((m) => {
          // the streak counts the run, not the result — showing up is the ask,
          // and the retainer is paid on the same terms
          markPlayed(m, date);
          const retainer = payRetainer(m, date);
          const out = applyRunResult(m, r);
          if (retainer > 0) {
            out.notes.unshift({
              msg: `The guild pays ${fmt(retainer)}g — ${m.streak} ${m.streak === 1 ? 'night' : 'nights'} running.`,
              cls: 'w',
            });
          }
          return out;
        });
        if (payout.notes.length) setFeed((f) => [...f, ...payout.notes].slice(-6));
        const verdict = verdictFor(r);
        setOver({
          title: verdict.title,
          subtitle: verdict.sub,
          success: r.success,
          loot: r.loot,
          stolenPct: r.stolenPct,
          guardsSlain: r.guardsSlain,
          crewLost: r.crewLost,
          tok: payout.tok,
          nextDepth: getMeta().depth,
          share: shareText({
            date,
            depth,
            mod: modFor(date, depth).n,
            result: r,
            crewIn: crewAtStart,
            lostNames: r.crewLostTids.map((tid) => nameOf.get(tid) ?? 'someone'),
            streak: getMeta().streak,
          }),
        });
        const m = getMeta();
        setLastRun(
          `Depth ${m.depth} awaits · best depth cleared: ${m.best} · today’s biggest heist: ${fmt(m.todayBest)}g`,
        );

        /* Post it to the shared board.
           Deliberately after the payout is already applied and the card is
           already up: the run belongs to the player whether or not a server
           ever hears about it, and nothing on screen waits for this. A refusal
           or a timeout is one quiet toast, never an interruption. */
        void postRun({
          pid: m.pid,
          name: m.name,
          date,
          depth,
          loot: Math.round(r.loot),
          verdict: verdict.id,
        }).then((res) => {
          if (res.ok && res.rank) toast(`Posted to the board — ${ordinal(res.rank)} tonight at depth ${depth}.`);
          else if (res.why && res.why !== 'nothing to post') toast(`The board did not hear that one: ${res.why}`);
        });
      }
    };

    const paintHud = (s: RunState): void => {
      setT(hLoot.current, fmt(s.loot));
      setT(hCrew.current, String(s.units.length));
      setT(sLoot.current, fmt(s.loot));
      setT(wakePct.current, `${Math.floor(s.wake)}%`);
      if (wakeFill.current) wakeFill.current.style.width = `${s.wake}%`;
      const grade = readyRef.current?.grade ?? 'flee';
      setT(wakeHint.current, wakeHintFor(s, grade));

      // The wyrm's own bar, only once it is awake. Before that it would just be
      // a number to stare at; after, it is the single fact deciding fight or run.
      if (wyrmBox.current) wyrmBox.current.style.display = s.dragon.awake ? '' : 'none';
      // the three beats worth feeling through a phone, each fired once
      if (s.heartState === 'taken' && !felt.current.heart) {
        felt.current.heart = true;
        buzz([40, 40, 40, 40, 40, 40, 240]);
      } else if (s.dragon.awake && !felt.current.woke) {
        felt.current.woke = true;
        buzz([60, 50, 60, 50, 180]);
      } else if (s.wake >= 75 && !felt.current.stirs) {
        felt.current.stirs = true;
        buzz([30, 40, 30]);
      } else if (s.guards.some((g) => g.alert) && !felt.current.seen) {
        felt.current.seen = true;
        buzz(35);
      }
      if (s.dragon.awake) {
        const pct = Math.max(0, (s.dragon.hp / s.dragon.max) * 100);
        setT(wyrmPct.current, `${Math.ceil(pct)}%`);
        if (wyrmFill.current) wyrmFill.current.style.width = `${pct}%`;
        setT(wyrmCall.current, readyRef.current?.line ?? '');
      }

      const inz = extractReady(s);
      setT(
        hintBar.current,
        pickedRef.current !== null && !s.dragon.awake
          ? `◎ ${s.units.find((u) => u.tid === pickedRef.current)?.name ?? 'They'} alone — tap where they should hold`
          : coachFor(s, inz, grade, keysRef.current),
      );

      const stolen = Math.round(100 * (1 - s.hoard.pool / s.hoard.pool0));
      setT(stolenPct.current, `${stolen}%`);
      if (stolenFill.current) stolenFill.current.style.width = `${stolen}%`;
      // The two thresholds pull against each other on purpose: the guards move
      // to the door at 50%, the payout doubles at 60%. Say both out loud, at
      // the moment each one is the question the player is actually asking.
      setT(
        stolenHint.current,
        !s.sealed
          ? 'Half the hoard turns every guard toward the door. 60% pays double.'
          : stolen < 60
            ? 'The door is held. 60% still pays double — decide what that is worth.'
            : 'Double pay is yours. There is nothing else to buy down here.',
      );

      const b = extractBtn.current;
      if (b) {
        if (inz > 0 && !s.over) {
          const left = s.units.length - inz;
          b.classList.remove('hidden');
          // leaving people behind is permanent, so say so on the button itself
          b.classList.toggle('warn', left > 0);
          setT(
            b,
            left > 0
              ? `⚑ EXTRACT — LEAVE ${left} BEHIND`
              : `⚑ EXTRACT — ALL ${inz} CLEAR`,
          );
        } else b.classList.add('hidden');
      }

      // SEIZE is offered only while the Heart is bare — the moment of the fork.
      // It vanishes the instant it is taken (the roof is falling; there is
      // nothing left to decide) or the run ends.
      const sb = seizeBtn.current;
      if (sb) sb.classList.toggle('hidden', !(s.heartState === 'exposed' && !s.over));

      for (const u of s.units) {
        const bar = hpBars.current.get(u.tid);
        if (bar) bar.style.width = `${(100 * u.hp) / u.max}%`;
      }

      const posted = s.units.filter((u) => u.ord).map((u) => u.tid);
      const sigHeld = posted.join(',');
      if (sigHeld !== lastHeld) {
        lastHeld = sigHeld;
        setHeld(posted);
      }
    };

    /* The prototype's QA handle (handoff §4). Development only — it exposes
       the whole run state, which would be a cheat surface in production. */
    if (process.env.NODE_ENV !== 'production') {
      const handle = {
        get M() {
          return getMeta();
        },
        get R() {
          return run;
        },
        useItem: (k: ItemKey) => inputRef.current?.push({ c: 'item', k }),
        setWake: (n: number) => {
          run.wake = n;
        },
        forceEnd: (ok: boolean) => (ok ? void inputRef.current?.push({ c: 'extract' }) : abandonRun(run)),
        snapshot: () => snapshotJSON(run),
      };
      const w = window as unknown as { DJ?: unknown; HB?: unknown };
      w.DJ = handle;
      w.HB = handle; // the name the handoff (§4) tells QA to reach for
    }

    // the ticket dies with the page, which is what makes a refresh land on the
    // landing page instead of silently rerolling the night
    const drop = (): void => disarmRaid();
    window.addEventListener('pagehide', drop);

    drain(run); // the opening banner, whisper and drum hit

    const loop = createLoop({
      state: () => run,
      input: () => {
        const f = input.read();
        // The pointer goes back to the crew the moment a posting is given, so
        // the highlight has to go with it — a mode that lies about being on is
        // worse than no mode at all.
        if (f.commands?.some((c) => c.c === 'move' && c.tid !== undefined)) setPicked(null);
        return f;
      },
      paused: () => pausedRef.current,
      afterStep: drain,
      render: (s, alpha, t, dt) => {
        const f = crewFocus(s.units.length ? s.units : [s.dragon]);
        viewRef.current = viewFor(canvas.clientWidth, canvas.clientHeight, f.x, f.y);
        renderer.render(s, alpha, t, dt);
        paintHud(s);
      },
    });
    loop.start();

    return () => {
      ro.disconnect();
      window.removeEventListener('pagehide', drop);
      // deliberately NOT disarming here: React StrictMode runs this cleanup
      // between two mounts in development, and tearing the ticket up in the
      // middle would bounce a raid the player legitimately walked into. The
      // ticket's own expiry covers the case this would have caught.
      loop.stop();
      input.dispose();
      inputRef.current = null;
      runRef.current = null;
      if (process.env.NODE_ENV !== 'production') {
        const w = window as unknown as { DJ?: unknown; HB?: unknown };
        delete w.DJ;
        delete w.HB;
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('keydown', onEsc);
    };
    // one run per mount — the raid page is entered fresh from the hideout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useItemBtn = useCallback((k: ItemKey): void => {
    inputRef.current?.push({ c: 'item', k });
  }, []);

  const doExtract = useCallback((): void => {
    inputRef.current?.push({ c: 'extract' });
  }, []);

  const doSeize = useCallback((): void => {
    inputRef.current?.push({ c: 'seize' });
  }, []);

  const toggleCreep = useCallback((): void => {
    setCreep((on) => {
      inputRef.current?.setCreep(!on);
      return !on;
    });
  }, []);

  const abandon = useCallback((): void => {
    const run = runRef.current;
    setMenu(false);
    if (run && !run.over) abandonRun(run);
  }, []);

  const closeTutorial = useCallback((): void => {
    markTutorialSeen();
    setTut(false);
    toast('Follow the golden arrow — quiet feet, quick hands');
  }, []);

  return (
    <>
      <div id="app">
        <header>
          <div className="brand">
            <span className="brandLong">THE DRAGON JOB</span>
            <span className="brandShort">DRAGON JOB</span>
          </div>
          <div className="hstat">
            <span className="lbl">DEPTH</span>
            <b id="hDepth" ref={hDepth}>
              1
            </b>
          </div>
          <div className="hstat">
            <span className="lbl">LOOT</span>
            <i className="ic g" />
            <b id="hLoot" ref={hLoot}>
              0
            </b>
          </div>
          <div className="hstat hstatCrew">
            <span className="lbl">CREW</span>
            <b id="hCrew" ref={hCrew}>
              0
            </b>
          </div>
          <span id="helpBtn" onClick={() => setTut(true)}>
            <span className="helpLong">? how to heist</span>
            <span className="helpShort">?</span>
          </span>
          <button
            id="muteBtn"
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (audioRef.current) audioRef.current.muted = next;
              mutate((m) => (m.muted = next));
            }}
            aria-pressed={muted}
            title={muted ? 'Sound off — click for sound' : 'Sound on — click to mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <span id="pauseBtn" onClick={() => setMenu(true)} title="Pause (Esc)">
            ❙❙
          </span>
        </header>

        <main>
          <div id="cwrap">
            <canvas id="cv" ref={cvRef} />
            <div id="stick" ref={stickRef}>
              <div id="knob" ref={knobRef} />
            </div>
          </div>
          <div id="hintBar" ref={hintBar}>
            🕹 Drag the stick to steer · tap an item to use it · EXTRACT at the exit tiles
          </div>
        </main>

        <section id="side">
          <div className="wakeBox wyrmBox" ref={wyrmBox} style={{ display: 'none' }}>
            <div className="row">
              <span className="lbl">THE WYRM</span>
              <b id="wyrmPct" ref={wyrmPct}>
                100%
              </b>
            </div>
            <div className="wbar wbar-wyrm">
              <i ref={wyrmFill} />
            </div>
            <div className="wyrmCall" ref={wyrmCall} />
          </div>

          <div className="wakeBox wakeMeter">
            <div className="row">
              <span className="lbl">WYRM WAKE</span>
              <b id="wakePct" ref={wakePct}>
                0%
              </b>
            </div>
            <div className="wbar">
              <i id="wakeFill" ref={wakeFill} />
            </div>
            <div
              id="wakeHint"
              ref={wakeHint}
              style={{ fontSize: 9.5, color: 'var(--dim)', fontStyle: 'italic', marginTop: 5 }}
            >
              Combat, chests and siphoning stir the beast.
            </div>
          </div>

          <div className="lootRow">
            <i className="ic g" />
            <b id="sLoot" ref={sLoot}>
              0
            </b>
            <span style={{ color: 'var(--dim)', fontSize: 11 }}>this run</span>
          </div>

          <div className="wakeBox hoardMeter">
            <div className="row">
              <span className="lbl">HOARD STOLEN</span>
              <b id="stolenPct" ref={stolenPct}>
                0%
              </b>
            </div>
            <div className="wbar gold">
              <i id="stolenFill" ref={stolenFill} />
            </div>
            <div
              id="stolenHint"
              ref={stolenHint}
              style={{ fontSize: 9.5, color: 'var(--dim)', fontStyle: 'italic', marginTop: 5 }}
            >
              60% or more pays double $LOOT for this depth.
            </div>
          </div>

          <div className="lbl">RELICS</div>
          <div id="relicRow">
            {relics.length === 0 ? (
              <span className="relicNone">none yet — find a shrine</span>
            ) : (
              relics.map((k) => (
                <span className="relic" key={k} title={`${RELICS[k].n} — ${RELICS[k].d}`}>
                  <span className="em">{RELICS[k].em}</span>
                  <span className="rt">{RELICS[k].n}</span>
                </span>
              ))
            )}
          </div>
        </section>

        {/* Everything a hand reaches for, in a band of its own.
         *
         * On a desktop this is simply the bottom half of the right rail and the
         * seam is invisible. On a phone it is the whole point of the layout: the
         * readouts sit above the lair, the controls sit below it, and the lair
         * itself is in the middle of the screen instead of squeezed against one
         * end of it. Splitting the markup is what lets one grid put them on
         * opposite sides of the game. */}
        <section id="under">
          {/* The fork, offered only while the Heart is bare. Its own colour and
             its place directly under the lair make it the loudest control on the
             board for the few seconds it exists. */}
          <button id="btnSeize" ref={seizeBtn} className="btn heart big hidden" onClick={doSeize}>
            💛 SEIZE THE HEART ×{TUNING.HEART_MUL}
          </button>

          <div id="itemBar">
            {ITEM_KEYS.map((k) => (
              <div
                className={`itb${items[k] <= 0 ? ' dis' : ''}`}
                key={k}
                onClick={() => useItemBtn(k)}
              >
                <span className="key">{ITEMS[k].key}</span>
                <span className="cnt" id={`it_${k}`}>
                  {items[k]}
                </span>
                <span className="em">{ITEMS[k].em}</span>
                <span className="tn">{ITEMS[k].n.split(' ')[0]}</span>
              </div>
            ))}
          </div>

          <button
            id="creepBtn"
            className={`creepBtn${creep ? ' on' : ''}`}
            onClick={toggleCreep}
            title="Slower, quieter, harder to spot."
          >
            <span className="em">👣</span>
            <span className="tn">{creep ? 'CREEPING' : 'CREEP'}</span>
            <span className="key">SHIFT</span>
          </button>

          <div className="lbl">THE CREW</div>
          <div id="squadList" className="squadList">
            {squad.map((u) => (
              <div
                className={`sq${picked === u.tid ? ' picked' : ''}`}
                key={u.tid}
                role="button"
                tabIndex={0}
                title={`Order ${u.name} alone — then tap the lair`}
                onClick={() => {
                  const next = picked === u.tid ? null : u.tid;
                  setPicked(next);
                  inputRef.current?.setSolo(next);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  const next = picked === u.tid ? null : u.tid;
                  setPicked(next);
                  inputRef.current?.setSolo(next);
                }}
              >
                <SpriteCanvas sprite={UD[u.kind].spr} width={20} height={22} pad={2} />
                <span className="sn">
                  {u.name} <span style={{ color: 'var(--dim)' }}>· {UD[u.kind].n}</span>
                </span>
                {held.includes(u.tid) && (
                  <button
                    className="heldChip"
                    title={`${u.name} is holding a post — click to call them back`}
                    onClick={(e) => {
                      e.stopPropagation();
                      inputRef.current?.push({ c: 'recall', tid: u.tid });
                    }}
                  >
                    HOLDING ✕
                  </button>
                )}
                {u.lv > 0 && <span className="sl">Lv.{u.lv}</span>}
                <span className="shp">
                  <i
                    ref={(el) => {
                      if (el) hpBars.current.set(u.tid, el);
                      else hpBars.current.delete(u.tid);
                    }}
                    style={{ width: '100%' }}
                  />
                </span>
              </div>
            ))}
          </div>

          <button id="btnExtract" ref={extractBtn} className="btn gold big hidden" onClick={doExtract}>
            ⚑ EXTRACT (0)
          </button>

          <div className="lbl">WHISPERS</div>
          <div id="feed">
            {feed.map((f, i) => (
              <div className={`f ${f.cls}`} key={`${i}-${f.msg}`}>
                {f.msg}
              </div>
            ))}
          </div>
        </section>
      </div>

      {tut && (
        <div id="tutWrap">
          <div className="ocard tut">
            <h2 className="big">HOW TO HEIST 🗝</h2>
            <div className="tsteps">
              <div className="ts">
                <b>1 · THE JOB.</b> A dragon sleeps on a hoard deep in this lair. Today&apos;s lair is the{' '}
                <span className="au">same for every player</span> — biggest heist tops the board. The{' '}
                <span className="au">golden arrow</span> points to the gold.
              </div>
              <div className="ts">
                <b>2 · MOVE.</b> Steer with the <b>{keys ? 'joystick / WASD' : 'stick'}</b> — your lead thief
                (gold ▼) drives, the crew follows. Or {keys ? 'click' : 'tap'} a tile to send them. Rooms hide
                chests, shrines with{' '}
                <span className="au">relics</span>, armories… and sometimes a <b>prison</b> holding a fallen
                friend. Stand close to interact.
              </div>
              <div className="ts">
                <b>3 · SPLIT THEM UP.</b> {keys ? 'Click' : 'Tap'} a name under <b>THE CREW</b>, then{' '}
                {keys ? 'click' : 'tap'} the lair:{' '}
                <span className="au">that thief alone</span> goes there and holds it while everyone else carries
                on. A Bruiser parked in a doorway buys the rest of the crew a great deal of time. Their row
                shows <b>HOLDING</b> — click it to call them back.
              </div>
              <div className="ts">
                <b>4 · THERE IS NO ATTACK BUTTON.</b> Your crew <span className="au">fights on its own</span> the
                moment a guard is in reach — you will see the damage numbers pop. Your job is <em>where</em> they
                stand, not when they swing. Walk away and they stop.
              </div>
              <div className="ts">
                <b>5 · STAY QUIET.</b> Noise fills <span className="re">WYRM WAKE</span>. At 50% one eye opens and
                it breathes in its sleep. At 75% guards stir. At 100% — it hunts.{' '}
                {keys ? (
                  <>
                    Hold <b>SHIFT</b> (or tap <b>CREEP</b>)
                  </>
                ) : (
                  <>
                    Tap <b>CREEP</b>
                  </>
                )}{' '}
                to move slow and quiet — guards notice you far later. Items help: Smoke, Lullaby, Bear Trap.
              </div>
              <div className="ts">
                <b>6 · IT IS NOT DEAD, IT IS ASLEEP.</b> The wyrm <span className="re">turns over</span> on its
                bed and sweeps its tail across the gold — you get a warning ring, so move. The coins it is lying
                on are the <span className="au">DEEP GOLD</span>: standing in that ring pays roughly double and
                wakes it far faster. The ring moves when it does.
              </div>
              <div className="ts">
                <b>7 · HALF THE HOARD IS THE LINE.</b> Take more than half and every guard stops chasing you and
                goes to <span className="re">hold the entrance</span> — the exit tiles turn red. Past 60% your
                whole take pays <span className="au">double</span>. Those two facts are meant to argue with each
                other.
              </div>
              <div className="ts">
                <b>8 · GET OUT.</b> Green arrow = time to run. Reach the EXIT tiles and{' '}
                {keys ? (
                  <>
                    press <b>EXTRACT / E</b>
                  </>
                ) : (
                  <>
                    tap <b>EXTRACT</b>
                  </>
                )}
                .
                Anyone not standing on the green is <span className="re">left behind for good</span> — the button
                tells you how many. Survivors gain XP. The dead end up in dragon prisons — go get them back.
              </div>
            </div>
            <button className="btn gold big" onClick={closeTutorial}>
              UNDERSTOOD — LET&apos;S ROB A DRAGON
            </button>
          </div>
        </div>
      )}

      {menu && !over && (
        <div id="overWrap">
          <div className="ocard">
            <h2 style={{ color: 'var(--em)' }}>THE CREW HOLDS STILL</h2>
            <div className="ostats">
              The wyrm is not counting while you think.
              <br />
              <span style={{ color: 'var(--dim)' }}>
                {keys ? 'Esc to close. ' : ''}Walking away costs you the loot <b>and the crew</b> — same as dying,
                just faster.
              </span>
            </div>
            <button className="btn gold big" onClick={() => setMenu(false)}>
              ▶ BACK TO THE HEIST
            </button>
            <button className="btn warn big" style={{ marginTop: 10 }} onClick={abandon}>
              ✖ ABANDON THE RUN
            </button>
          </div>
        </div>
      )}

      {over && (
        <div id="overWrap">
          <div className="ocard">
            <h2 style={{ color: over.success ? 'var(--gold)' : 'var(--red)' }}>{over.title}</h2>
            {over.subtitle && (
              <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--dim)', marginTop: 4 }}>
                {over.subtitle}
              </div>
            )}
            <div className="ostats">
              {over.success ? (
                <>
                  Loot banked: <b>{fmt(over.loot)}g</b> · hoard stolen: <b>{over.stolenPct}%</b>
                </>
              ) : (
                <>
                  Loot lost: <b>{fmt(over.loot)}g</b> — the deep keeps it.
                </>
              )}
              <br />
              Guards slain: <b>{over.guardsSlain}</b> · crew lost: <b>{over.crewLost}</b>
              <br />
              {over.success ? (
                <>
                  $LOOT earned: <b>+{over.tok}</b> · survivors gain XP · next: <b>Depth {over.nextDepth}</b>
                </>
              ) : (
                <>Your hideout gold is safe. The fallen wait in dragon prisons.</>
              )}
            </div>
            <pre className="shareCard">{over.share}</pre>
            <div className="overBtns">
              <button className="btn" onClick={() => doShare(over.share)}>
                📋 COPY THE STORY
              </button>
              <button className="btn gold" onClick={() => router.push('/hideout')}>
                ⛺ RETURN TO HIDEOUT
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </>
  );
}
