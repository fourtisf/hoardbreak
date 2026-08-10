'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MODS, fmt, modFor, todayUTC } from '@hoardbreak/engine';
import { boardRows } from '@hoardbreak/shared';
import { useMeta } from '@/lib/store';

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
  const isToday = day === dates[0];
  const rows = boardRows(day, isToday ? meta.todayBest : 0);

  return (
    <div id="camp">
      <h2>THE BOARD</h2>
      <div id="daily">
        BIGGEST SINGLE HEIST — <b>{day}</b>
        <br />
        {isToday ? 'live · rolls over at UTC midnight' : 'archived'}
      </div>

      <div className="cols">
        <div className="col">
          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              LEADERBOARD
            </div>
            <div id="board">
              {rows.map((r, i) => (
                <div className={`r${r.you ? ' you' : ''}`} key={`${r.n}-${i}`}>
                  <span>{i + 1}</span>
                  <b>{r.n}</b>
                  <span>{fmt(r.s)}g</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panelBox" style={{ minWidth: 280 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              PAST DAYS
            </div>
            <div id="board">
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
              {Array.from({ length: 6 }, (_, i) => i + 1).map((depth) => {
                const m = modFor(day, depth);
                return (
                  <div key={depth}>
                    Depth {depth} · <span className="lv">{m.n}</span>
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
        Phase 1 board — rivals are seeded from the day, your score is this session&apos;s best. Phase 2 wires this
        to the real Redis board.
      </div>
    </div>
  );
}
