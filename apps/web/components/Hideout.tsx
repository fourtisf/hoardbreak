'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
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
} from '@dragonjob/engine';
import {
  boardRows,
  exportSave,
  importSave,
  slayerReadiness,
  buyItem,
  buyUpgrade,
  conscript,
  needsConscript,
  recruit,
  rollDay,
  selectDepth,
  unlockedDepth,
} from '@dragonjob/shared';
import { getMeta, mutate, replaceMeta, resetMeta, useLastRun, useMeta } from '@/lib/store';
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
  const unlocked = unlockedDepth(meta);
  const rows = boardRows(date, meta.depth, meta.todayBestByDepth[meta.depth] ?? 0);
  const bestHere = meta.bestByDepth[meta.depth] ?? 0;
  const stranded = needsConscript(meta);
  const ready = slayerReadiness(meta, meta.depth);

  // a session that outlives UTC midnight has to roll its own day over
  useEffect(() => {
    mutate((m) => rollDay(m, date));
  }, [date]);

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

  const pickDepth = (d: number): void => {
    mutate((m) => selectDepth(m, d));
  };

  const takeConscript = (): void => {
    const r = mutate((m) => conscript(m));
    toast(r.msg);
  };

  /**
   * Everything lives in this browser, so one cleared cache takes the crew, the
   * gold and the streak with it. Until accounts exist, a code the player keeps
   * is the honest answer.
   */
  const copySave = async (): Promise<void> => {
    const code = exportSave(getMeta());
    try {
      await navigator.clipboard.writeText(code);
      toast('Save code copied. Keep it somewhere safe — it is your whole hideout.');
    } catch {
      window.prompt('Copy this save code and keep it somewhere safe:', code);
    }
  };

  const restoreSave = (): void => {
    const code = window.prompt('Paste a save code to restore that hideout. This replaces the one you have now.');
    if (code === null) return;
    const r = importSave(code);
    if (!r.ok) {
      toast(r.msg);
      return;
    }
    replaceMeta(r.meta);
    toast('Hideout restored.');
  };

  const startOver = (): void => {
    if (!window.confirm('Burn the hideout and start again? Your crew, gold and depths all go.')) return;
    resetMeta();
    toast('A new hideout, a new crew. Try to keep this one.');
  };

  return (
    <>
      <div id="camp">
        <div className="campHead">
          <span className="mark markS" aria-hidden="true" />
          <h2>THE HIDEOUT</h2>
        </div>

        <div id="daily">
          DAILY HEIST — <b>{date}</b> · same lairs for every player
          <br />
          Depth {meta.depth} tonight: <b>{mod.n}</b> — {mod.d}
          {bestHere > 0 && (
            <>
              <br />
              <span style={{ color: 'var(--dim)' }}>your best here: {fmt(bestHere)}g</span>
            </>
          )}
        </div>

        <div className="depthPick">
          <span className="lbl">CHOOSE TONIGHT&apos;S LAIR</span>
          <div className="depthRow">
            {Array.from({ length: unlocked }, (_, i) => i + 1).map((d) => {
              const m = modFor(date, d);
              return (
                <button
                  key={d}
                  className={`dbtn${d === meta.depth ? ' on' : ''}`}
                  onClick={() => pickDepth(d)}
                  title={`${m.n} — ${m.d}`}
                >
                  <b>{d}</b>
                  <span>{m.n}</span>
                </button>
              );
            })}
          </div>
          <div className="depthNote">
            Everyone who picks the same depth tonight raids the same lair — that is what the board ranks.
            {unlocked === 1 && ' Clear depth 1 to unlock deeper lairs.'}
          </div>
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
          {meta.streak > 0 && (
            <span title={`Longest run of days: ${meta.bestStreak}`}>
              STREAK <b>{meta.streak}</b>
              {meta.streak >= 2 ? ' days' : ' day'}
            </span>
          )}
        </div>

        {/* The question every wipe against the dragon raises, answered before
            the player walks in rather than after they have lost everyone. */}
        <div className={`slayer sl-${ready.grade}`}>
          <span className="slHead">
            {ready.grade === 'ready' ? '⚔ WYRMSLAYER' : ready.grade === 'risky' ? '⚔ ALMOST' : '☠ DO NOT FIGHT IT'}
          </span>
          <span className="slLine">{ready.line}</span>
          <span className="slNums">
            crew {Math.round(ready.dps)} dps · wyrm {fmt(ready.dragonHp)} hp at depth {meta.depth}
          </span>
        </div>

        <div className="cols">
          <div className="col">
            {stranded && (
              <div className="stranded">
                <div>
                  <div className="un">No crew, no coin.</div>
                  <div className="ud">The guild will front you a body — once.</div>
                </div>
                <button className="btn" onClick={takeConscript}>
                  CALL IN A FAVOUR
                </button>
              </div>
            )}
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

            {/* who you have sits under who you can hire — same question, and it
                keeps the recruit column from bottoming out into dead space */}
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
                  <>
                    <div style={{ color: 'var(--red)' }}>
                      Imprisoned: {meta.lost.map((t) => t.name).join(', ')}
                    </div>
                    <div style={{ color: 'var(--gold)' }}>
                      Tonight&apos;s prison holds <b>{meta.lost[0]!.name}</b>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="col">
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
                TODAY&apos;S BOARD — DEPTH {meta.depth}
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
        <div className="footRow">
          <Link href="/board" className="ul" style={{ textDecoration: 'none' }}>
            view every depth &amp; the past week →
          </Link>
          <span className="ul">·</span>
          <span className="ul saved" title="Your hideout is saved in this browser">
            ✓ saved on this device
          </span>
          <span className="ul">·</span>
          <button className="ul linkish" onClick={startOver}>
            start over
          </button>
          <span className="ul">·</span>
          <button className="ul linkish" onClick={copySave} title="Copy a code that restores this hideout anywhere">
            save code
          </button>
          <span className="ul">·</span>
          <button className="ul linkish" onClick={restoreSave}>
            restore
          </button>
          <span className="ul">·</span>
          <a className="ul xlink" href="https://x.com/TheDragonjob" target="_blank" rel="noopener noreferrer">
            𝕏 @TheDragonjob
          </a>
        </div>

        {/* The one thing a player came here to do. It is the last element in the
            document but sticks to the bottom of the scroller, so on a screen
            where the hideout is taller than the viewport it is still one click
            away instead of buried under the shop. */}
        <div className="raidBar">
          {/* a mute disabled button tells a new player nothing about why */}
          <button id="btnRaid" className="btn gold big" onClick={raid} disabled={meta.crew.length === 0}>
            {meta.crew.length === 0
              ? '⚔ HIRE SOMEONE FIRST — THE LAIR WON’T ROB ITSELF'
              : `⚔ RAID THE LAIR — DEPTH ${meta.depth}`}
          </button>
        </div>
      </div>
      <Toast />
    </>
  );
}
