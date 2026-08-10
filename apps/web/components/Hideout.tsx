'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  CREW_CAP,
  CREW_KINDS,
  ITEMS,
  ITEM_KEYS,
  UD,
  UPGRADES,
  UPGRADE_KEYS,
  fmt,
  lvlOf,
  modFor,
  todayUTC,
  type CrewKind,
  type ItemKey,
  type UpgradeKey,
} from '@hoardbreak/engine';
import { boardRows, buyItem, buyUpgrade, recruit } from '@hoardbreak/shared';
import { getMeta, mutate, useLastRun, useMeta } from '@/lib/store';
import { toast } from '@/lib/toast';
import SpriteCanvas from './SpriteCanvas';
import Toast from './Toast';

/** THE HIDEOUT — recruit, gear up, read the board, then go rob a dragon. */
export default function Hideout() {
  const router = useRouter();
  const meta = useMeta();
  const lastRun = useLastRun();
  const date = useMemo(() => todayUTC(), []);
  const mod = modFor(date, meta.depth);
  const rows = boardRows(date, meta.todayBest);

  const doRecruit = (k: CrewKind): void => {
    const r = mutate((m) => recruit(m, k));
    toast(r.msg);
  };

  const doUpgrade = (k: UpgradeKey): void => {
    const r = mutate((m) => buyUpgrade(m, k));
    if (!r.ok) toast(r.msg);
  };

  const doItem = (k: ItemKey): void => {
    const r = mutate((m) => buyItem(m, k));
    if (!r.ok) toast(r.msg);
  };

  const raid = (): void => {
    if (getMeta().crew.length === 0) {
      toast('Recruit a crew first');
      return;
    }
    router.push('/raid');
  };

  return (
    <>
      <div id="camp">
        <h2>THE HIDEOUT</h2>

        <div id="daily">
          DAILY HEIST — <b>{date}</b> · same lairs for every player
          <br />
          Depth {meta.depth} tonight: <b>{mod.n}</b> — {mod.d}
        </div>

        <div className="stats">
          <span>
            GOLD <i className="ic g" /> <b>{fmt(meta.gold)}</b>
          </span>
          <span>
            $LOOT <i className="ic t" /> <b>{fmt(meta.tok)}</b>
          </span>
          <span>
            DEPTH <b>{meta.depth}</b>
          </span>
          <span>
            CREW <b>{meta.crew.length}</b>/{CREW_CAP}
          </span>
          <span>
            TODAY&apos;S BEST <b>{fmt(meta.todayBest)}</b>g
          </span>
        </div>

        <div className="cols">
          <div className="col">
            <div className="lbl">RECRUIT — each class has a unique skill</div>
            <div className="roster" id="roster">
              {CREW_KINDS.map((k) => {
                const d = UD[k];
                const owned = meta.crew.filter((t) => t.kind === k).length;
                const locked = meta.gold < d.cost || meta.crew.length >= CREW_CAP;
                return (
                  <div className="rc" key={k}>
                    <b className="cnt">{owned}</b>
                    <SpriteCanvas sprite={d.spr} width={62} height={68} />
                    <span className="rn">{d.n}</span>
                    <span className="rs">{d.skL}</span>
                    <button className={`btn${locked ? ' dim' : ''}`} onClick={() => doRecruit(k)}>
                      {d.cost} <i className="ic g" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col">
            <div className="panelBox">
              <div className="lbl" style={{ marginBottom: 6 }}>
                CREW MANIFEST
              </div>
              <div className="manif">
                {meta.crew.length === 0 ? (
                  <span style={{ color: 'var(--red)' }}>No crew. Recruit before you starve.</span>
                ) : (
                  meta.crew.map((t) => (
                    <div key={t.tid}>
                      {t.name} · {UD[t.kind].n} <span className="lv">Lv.{lvlOf(t)}</span>
                    </div>
                  ))
                )}
                {meta.lost.length > 0 && (
                  <div style={{ color: 'var(--red)' }}>Imprisoned: {meta.lost.map((t) => t.name).join(', ')}</div>
                )}
              </div>
            </div>

            <div className="panelBox">
              <div className="lbl" style={{ marginBottom: 6 }}>
                BLACK MARKET
              </div>

              {UPGRADE_KEYS.map((k) => {
                const u = UPGRADES[k];
                const maxed = meta.up[k] >= u.max;
                const dis = meta.gold < meta.upCost[k] || maxed;
                return (
                  <div className={`upg${dis ? ' dis' : ''}`} key={k} onClick={() => doUpgrade(k)}>
                    <div>
                      <div className="un">{u.n}</div>
                      <div className="ud">{u.d}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="uc">
                        {meta.upCost[k]}
                        <i className="ic g" />
                      </div>
                      <div className="ul">Lv.{meta.up[k]}</div>
                    </div>
                  </div>
                );
              })}

              {ITEM_KEYS.map((k) => {
                const it = ITEMS[k];
                const dis = meta.gold < it.cost;
                return (
                  <div className={`itemRow${dis ? ' dis' : ''}`} key={k} onClick={() => doItem(k)}>
                    <span className="em">{it.em}</span>
                    <div>
                      <div className="un">{it.n}</div>
                      <div className="ud">{it.d}</div>
                    </div>
                    <div className="uc">
                      {it.cost}
                      <i className="ic g" /> <span className="ul">×{meta.items[k]}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="panelBox">
              <div className="lbl" style={{ marginBottom: 6 }}>
                TODAY&apos;S BOARD — biggest single heist
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
          </div>
        </div>

        <button
          id="btnRaid"
          className={`btn gold big${meta.crew.length === 0 ? ' dim' : ''}`}
          onClick={raid}
        >
          ⚔ RAID THE LAIR — DEPTH {meta.depth}
        </button>

        <div
          id="lastRun"
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            color: 'var(--dim)',
            maxWidth: 520,
            textAlign: 'center',
          }}
        >
          {lastRun ?? ''}
        </div>
      </div>
      <Toast />
    </>
  );
}
