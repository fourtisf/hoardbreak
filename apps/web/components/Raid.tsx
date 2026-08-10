'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  H,
  ITEMS,
  ITEM_KEYS,
  UD,
  W,
  createAudio,
  createInput,
  createLoop,
  createRenderer,
  createRun,
  dailySeed,
  drainOutput,
  extractReady,
  fmt,
  modFor,
  todayUTC,
  type CrewKind,
  type FeedLine,
  type InputController,
  type ItemKey,
  type RunState,
} from '@hoardbreak/engine';
import { applyRunResult, snapshotRunMeta } from '@hoardbreak/shared';
import { getMeta, markTutorialSeen, mutate, setLastRun, tutorialSeen } from '@/lib/store';
import { toast } from '@/lib/toast';
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
  success: boolean;
  loot: number;
  stolenPct: number;
  guardsSlain: number;
  crewLost: number;
  tok: number;
  nextDepth: number;
}

/** Only touch the DOM when the text actually changed (the prototype's `setT`). */
const setT = (el: HTMLElement | null, v: string): void => {
  if (el && el.textContent !== v) el.textContent = v;
};

const wakeHintFor = (s: RunState): string =>
  s.dragon.awake
    ? 'IT HUNTS. Get to the green tiles.'
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
  const sLoot = useRef<HTMLElement>(null);
  const extractBtn = useRef<HTMLButtonElement>(null);
  const hpBars = useRef(new Map<number, HTMLElement>());

  const inputRef = useRef<InputController | null>(null);
  const pausedRef = useRef(true);

  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [items, setItems] = useState<Record<ItemKey, number>>({ smoke: 0, lull: 0, trap: 0 });
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [over, setOver] = useState<OverCard | null>(null);
  const [tut, setTut] = useState(() => !tutorialSeen());

  pausedRef.current = tut || over !== null;

  useEffect(() => {
    const canvas = cvRef.current;
    if (!canvas) return;

    const meta = getMeta();
    if (meta.crew.length === 0) {
      router.replace('/hideout');
      return;
    }

    /* --- start the run: Phase 1 computes the seed client-side, exactly like
       the prototype. Phase 2 swaps these three lines for POST /runs/start. --- */
    const date = todayUTC();
    const depth = meta.depth;
    const run = createRun({
      seed: dailySeed(date, depth),
      depth,
      mod: modFor(date, depth),
      meta: snapshotRunMeta(meta),
      date,
    });
    // a generated prisoner burns a thief id whether or not anyone frees them
    if (run.freshPrisonerTid !== null) meta.uid = Math.max(meta.uid, run.freshPrisonerTid);

    const renderer = createRenderer(canvas);
    renderer.buildRockCache(run);
    const audio = createAudio();
    const input = createInput({
      canvas,
      stick: stickRef.current,
      knob: knobRef.current,
      enabled: () => !pausedRef.current,
    });
    inputRef.current = input;

    const unlock = (): void => audio.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    setT(hDepth.current, String(depth));

    let lastItems = '';
    let applied = false;

    const drain = (s: RunState): void => {
      const out = drainOutput(s);
      if (out.sounds.length) audio.playAll(out.sounds);
      if (out.feed.length) setFeed((f) => [...f, ...out.feed].slice(-6));
      for (const m of out.toasts) toast(m);
      if (out.squadDirty) {
        setSquad(s.units.map((u) => ({ tid: u.tid, name: u.name, kind: u.k, lv: u.lv })));
      }
      const sig = `${s.items.smoke}/${s.items.lull}/${s.items.trap}`;
      if (sig !== lastItems) {
        lastItems = sig;
        setItems({ ...s.items });
      }
      if (s.over && s.result && !applied) {
        applied = true;
        const r = s.result;
        const payout = mutate((m) => applyRunResult(m, r));
        if (payout.notes.length) setFeed((f) => [...f, ...payout.notes].slice(-6));
        setOver({
          title: r.slain ? 'WYRMSLAYER' : r.success ? 'CLEAN GETAWAY' : 'THE WYRM FEEDS',
          success: r.success,
          loot: r.loot,
          stolenPct: r.stolenPct,
          guardsSlain: r.guardsSlain,
          crewLost: r.crewLost,
          tok: payout.tok,
          nextDepth: getMeta().depth,
        });
        const m = getMeta();
        setLastRun(
          `Depth ${m.depth} awaits · best depth cleared: ${m.best} · today’s biggest heist: ${fmt(m.todayBest)}g`,
        );
      }
    };

    const paintHud = (s: RunState): void => {
      setT(hLoot.current, fmt(s.loot));
      setT(hCrew.current, String(s.units.length));
      setT(sLoot.current, fmt(s.loot));
      setT(wakePct.current, `${Math.floor(s.wake)}%`);
      if (wakeFill.current) wakeFill.current.style.width = `${s.wake}%`;
      setT(wakeHint.current, wakeHintFor(s));

      const inz = extractReady(s);
      const b = extractBtn.current;
      if (b) {
        if (inz > 0 && !s.over) {
          b.classList.remove('hidden');
          setT(b, `⚑ EXTRACT (${inz}/${s.units.length} at exit)`);
        } else b.classList.add('hidden');
      }
      for (const u of s.units) {
        const bar = hpBars.current.get(u.tid);
        if (bar) bar.style.width = `${(100 * u.hp) / u.max}%`;
      }
    };

    drain(run); // the opening banner, whisper and drum hit

    const loop = createLoop({
      state: () => run,
      input: () => input.read(),
      paused: () => pausedRef.current,
      afterStep: drain,
      render: (s, alpha, t, dt) => {
        renderer.render(s, alpha, t, dt);
        paintHud(s);
      },
    });
    loop.start();

    return () => {
      loop.stop();
      input.dispose();
      inputRef.current = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
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

  const closeTutorial = useCallback((): void => {
    markTutorialSeen();
    setTut(false);
    toast('Follow the golden arrow — quiet feet, quick hands');
  }, []);

  return (
    <>
      <div id="app">
        <header>
          <div className="brand">HOARDBREAK</div>
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
          <div className="hstat">
            <span className="lbl">CREW</span>
            <b id="hCrew" ref={hCrew}>
              0
            </b>
          </div>
          <span id="helpBtn" onClick={() => setTut(true)}>
            <span className="helpLong">? how to heist</span>
            <span className="helpShort">?</span>
          </span>
        </header>

        <main>
          <div id="cwrap">
            <canvas id="cv" ref={cvRef} width={W} height={H} />
            <div id="stick" ref={stickRef}>
              <div id="knob" ref={knobRef} />
            </div>
          </div>
          <div id="hintBar">
            🕹 Drag the stick or WASD to steer · items on hotkeys 1·2·3 · E = extract at the green tiles
          </div>
        </main>

        <section id="side">
          <div className="wakeBox">
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

          <div className="lbl">THE CREW</div>
          <div id="squadList" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {squad.map((u) => (
              <div className="sq" key={u.tid}>
                <SpriteCanvas sprite={UD[u.kind].spr} width={20} height={22} pad={2} />
                <span className="sn">
                  {u.name} <span style={{ color: 'var(--dim)' }}>· {UD[u.kind].n}</span>
                </span>
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
                <b>2 · MOVE.</b> Steer with the <b>joystick / WASD</b> — your lead thief (gold ▼) drives, the crew
                follows — and <b>everyone fights automatically</b> when guards come near. Or click to send them.
                Rooms hide chests, shrines with <span className="au">relics</span>, armories… and sometimes a{' '}
                <b>prison</b> holding a fallen friend. Stand close to interact.
              </div>
              <div className="ts">
                <b>3 · STAY QUIET.</b> Noise fills <span className="re">WYRM WAKE</span>. At 50% one eye opens and
                it breathes in its sleep. At 75% guards stir. At 100% — it hunts. Items help: <b>[1]</b> Smoke{' '}
                <b>[2]</b> Lullaby <b>[3]</b> Bear Trap.
              </div>
              <div className="ts">
                <b>4 · GET OUT.</b> Green arrow = time to run. Reach the EXIT tiles, press <b>EXTRACT / E</b>.
                Survivors gain XP. The dead end up in dragon prisons — go get them back.
              </div>
            </div>
            <button className="btn gold big" onClick={closeTutorial}>
              UNDERSTOOD — LET&apos;S ROB A DRAGON
            </button>
          </div>
        </div>
      )}

      {over && (
        <div id="overWrap">
          <div className="ocard">
            <h2 style={{ color: over.success ? 'var(--gold)' : 'var(--red)' }}>{over.title}</h2>
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
            <button className="btn gold big" onClick={() => router.push('/hideout')}>
              ⛺ RETURN TO HIDEOUT
            </button>
          </div>
        </div>
      )}

      <Toast />
    </>
  );
}
