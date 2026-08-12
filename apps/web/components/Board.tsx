'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MODS, fmt, modFor, todayUTC } from '@dragonjob/engine';
import { useMeta } from '@/lib/store';
import { fetchBoard, type BoardState } from '@/lib/board';

const DAYS_BACK = 7;

/** UTC day strings, today first — the board rolls over at UTC midnight (§5). */
function recentDates(count: number): string[] {
  const out: string[] = [];
  const now = new Date(`${todayUTC()}T00:00:00Z`).getTime();
  for (let i = 0; i < count; i++) out.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

export default function Board() {
  const meta = useMeta();
  const dates = useMemo(() => recentDates(DAYS_BACK), []);
  const [day, setDay] = useState(dates[0] as string);
  const [depth, setDepth] = useState(1);
  const isToday = day === dates[0];

  /**
   * The board is a real thing on a real server now, which means it can be
   * down. It used to be four invented rivals with plausible scores — worse than
   * nothing, because it told players they were competing when they were alone.
   */
  const [state, setState] = useState<BoardState>({ k: 'loading' });
  const load = useCallback(() => {
    let live = true;
    setState({ k: 'loading' });
    void fetchBoard(day, depth, meta.pid).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [day, depth, meta.pid]);
  useEffect(load, [load]);

  return (
    <div id="camp">
      <h2>THE BOARD</h2>
      <div id="daily">
        BIGGEST SINGLE HEIST — <b>{day}</b> · DEPTH <b>{depth}</b>
        <br />
        {isToday ? 'live · rolls over at UTC midnight' : 'archived'}
      </div>

      <div className="depthPick">
        <span className="lbl">DEPTH</span>
        <div className="depthRow">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((d) => {
            const m = modFor(day, d);
            return (
              <button
                key={d}
                className={`dbtn${d === depth ? ' on' : ''}`}
                onClick={() => setDepth(d)}
                title={`${m.n} — ${m.d}`}
              >
                <b>{d}</b>
                <span>{m.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              LEADERBOARD — DEPTH {depth}
              {state.k === 'ok' && (
                <span style={{ color: 'var(--dim)', letterSpacing: 0 }}> · {state.standing.players} in tonight</span>
              )}
            </div>
            <div className="rows">
              {state.k === 'loading' && <div className="r">reading the board…</div>}
              {state.k === 'down' && (
                <>
                  <div className="r" style={{ color: 'var(--red)' }}>
                    The board is out of reach.
                  </div>
                  <div className="r" style={{ color: 'var(--dim)' }}>
                    {state.why} — your run is safe, it just has nobody to boast to yet.
                  </div>
                  <button className="btn" style={{ marginTop: 8, padding: '5px 12px', fontSize: 13 }} onClick={load}>
                    TRY AGAIN
                  </button>
                </>
              )}
              {state.k === 'empty' && (
                <div className="r" style={{ color: 'var(--dim)' }}>
                  Nobody has come back from this one yet. Be the first name on it.
                </div>
              )}
              {state.k === 'ok' &&
                state.standing.top.map((r, i) => (
                  <div className={`r${r.you ? ' you' : ''}`} key={`${r.n}-${i}`}>
                    <span>{i + 1}</span>
                    <b>{r.n}</b>
                    <span>{fmt(r.s)}g</span>
                  </div>
                ))}
              {/* somebody outside the top ten still deserves to know where they stand */}
              {state.k === 'ok' && state.standing.me && !state.standing.top.some((r) => r.you) && (
                <>
                  <div className="r" style={{ color: 'var(--dim)' }}>
                    ⋯
                  </div>
                  <div className="r you">
                    <span>{state.standing.rank}</span>
                    <b>{state.standing.me.n}</b>
                    <span>{fmt(state.standing.me.s)}g</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              PAST DAYS
            </div>
            <div className="rows">
              {dates.map((d) => (
                <div
                  className={`r${d === day ? ' you' : ''}`}
                  key={d}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDay(d)}
                >
                  <b>{d}</b>
                  <span>{d === dates[0] ? 'today' : 'archive'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              TONIGHT&apos;S LAIRS
            </div>
            <div className="manif">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((d) => {
                const m = modFor(day, d);
                return (
                  <div key={d}>
                    Depth {d} · <span className="lv">{m.n}</span>
                    {meta.bestByDepth[d] ? <span style={{ color: 'var(--dim)' }}> · you: {meta.bestByDepth[d]}g</span> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              MODIFIERS
            </div>
            <div className="manif">
              {MODS.map((m) => (
                <div key={m.id}>
                  <span className="lv">{m.n}</span> — {m.d}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link href="/hideout" className="btn gold big">
        ⛺ BACK TO THE HIDEOUT
      </Link>
      <div
        style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--dim)', maxWidth: 520, textAlign: 'center' }}
      >
        One row per player per night. Your best run of the night is the one that stands — a second run that went
        badly does not take the first one away.
      </div>
    </div>
  );
}
