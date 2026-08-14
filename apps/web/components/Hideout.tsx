'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CREW_CAP,
  CREW_KINDS,
  ITEMS,
  ITEM_KEYS,
  UD,
  UPGRADES,
  UPGRADE_KEYS,
  depthRules,
  fmt,
  lvlOf,
  isGrandVault,
  modFor,
  todayUTC,
  type CrewKind,
  type ItemKey,
  type UpgradeKey,
} from '@dragonjob/engine';
import {
  exportSave,
  importSave,
  RETAINER_CAP_DAYS,
  retainerFor,
  slayerPlan,
  slayerReadiness,
  buyItem,
  buyUpgrade,
  conscript,
  needsConscript,
  raidsOf,
  rankOf,
  recruit,
  rollDay,
  selectDepth,
  unlockedDepth,
} from '@dragonjob/shared';
import { getMeta, mutate, replaceMeta, resetMeta, useLastRun, useMeta } from '@/lib/store';
import { armRaid } from '@/lib/entry';
import { toast } from '@/lib/toast';
import { fetchBoard, fetchIntel, type BoardState, type IntelState } from '@/lib/board';
import SpriteCanvas from './SpriteCanvas';
import Toast from './Toast';

/**
 * How the whisper network reads a night's verdicts back to a player.
 *
 * Only the loud outcomes get a line — nobody plans a raid around how many crews
 * had an ordinary night. Ordered by how much the intel changes the decision to
 * go in: the wyrm being killable, and people taking the Heart, matter most.
 */
const INTEL_LABELS: { id: string; word: (n: number) => string }[] = [
  { id: 'SLAYER', word: (n) => `${n} slew the wyrm` },
  { id: 'HEARTTAKER', word: (n) => `${n} seized the Heart` },
  { id: 'FED', word: (n) => `${n} fed it` },
  { id: 'GHOST', word: (n) => `${n} went unseen` },
  { id: 'STRIPPED', word: (n) => `${n} stripped it bare` },
];

/** THE HIDEOUT — recruit, gear up, read the board, then go rob a dragon. */
export default function Hideout() {
  const router = useRouter();
  const meta = useMeta();
  const lastRun = useLastRun();
  const date = useMemo(() => todayUTC(), []);
  const mod = modFor(date, meta.depth);
  const grandNight = isGrandVault(date);
  const unlocked = unlockedDepth(meta);
  // the real board, or an honest silence — never invented rivals
  const [board, setBoard] = useState<BoardState>({ k: 'loading' });
  // the whisper network: what tonight's raiders did at this depth, if the board
  // is reachable and anyone has been in yet
  const [intel, setIntel] = useState<IntelState>({ k: 'loading' });
  useEffect(() => {
    let live = true;
    void fetchBoard(date, meta.depth, meta.pid).then((s) => {
      if (live) setBoard(s);
    });
    void fetchIntel(date, meta.depth).then((i) => {
      if (live) setIntel(i);
    });
    return () => {
      live = false;
    };
  }, [date, meta.depth, meta.pid]);
  const bestHere = meta.bestByDepth[meta.depth] ?? 0;
  const stranded = needsConscript(meta);
  const ready = slayerReadiness(meta, meta.depth);
  const plan = slayerPlan(meta, meta.depth);

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
    // the raid asks to see this on the way in, so a refreshed /raid can tell
    // "walked here from the hideout" from "typed the URL"
    armRaid();
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

        {/* the weekly event, announced above the daily line so it reads as the
            night it is, not just another modifier in the list */}
        {grandNight && (
          <div className="grandBanner">
            <span className="gbTitle">🔥 THE GRAND VAULT</span>
            <span className="gbSub">
              Tonight the whole world raids one fat, well-watched vault — a hoard more than twice the usual,
              and the cult standing on every coin of it. Once a week. Bring a crew that has seen a few nights.
            </span>
          </div>
        )}

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
                  title={[`${m.n} — ${m.d}`, ...depthRules(d).lines].join('\n')}
                >
                  <b>{d}</b>
                  <span>{m.n}</span>
                  {/* a rule that only shows up mid-run is an unfair rule */}
                  {depthRules(d).lines.length > 0 && <i className="dRules">{depthRules(d).lines.length}</i>}
                </button>
              );
            })}
          </div>
          {/* Whatever is different about *this* lair, said before it is entered.
              Depth used to be more health and more gold and nothing else; these
              are rules, and a player choosing a depth is choosing them. */}
          {depthRules(meta.depth).lines.length > 0 && (
            <div className="depthRules">
              {depthRules(meta.depth).lines.map((l) => (
                <div key={l}>☠ {l}</div>
              ))}
            </div>
          )}
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
          {/* the streak used to be a number in a corner. Say what it is worth,
              and say it beside the gold it pays into. */}
          <span title="Paid once a night, for turning up — win or lose">
            RETAINER{' '}
            <b style={{ color: 'var(--gold)' }}>
              {meta.retainerPaid === date
                ? 'paid'
                : `${fmt(retainerFor(Math.min(meta.streak + 1, RETAINER_CAP_DAYS)))}g`}
            </b>
            {meta.retainerPaid === date ? ' tonight' : ' next run'}
          </span>
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
          {/* Naming the wall without naming the door is what makes players
              conclude the fight is decorative. This is the door, priced. */}
          {plan.steps.length > 0 && <span className="slPlan">→ {plan.line}</span>}
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
                      {t.name} · {UD[t.kind].n} <span className="lv">Lv.{lvlOf(t)}</span>{' '}
                      {/* what they have earned by surviving — a veteran should not
                          read the same as this morning's conscript */}
                      <span className="rank">{rankOf(t)}</span>
                      {raidsOf(t) > 0 && <span className="raids"> · {raidsOf(t)} raids</span>}
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

            {/* The memorial — the ones no cage ever gave back. Only shown once
                there is a name on it, because an empty wall is a promise the
                game has not made yet. */}
            {meta.fallen.length > 0 && (
              <div className="panelBox memorial">
                <div className="lbl" style={{ marginBottom: 6 }}>
                  THE FALLEN
                </div>
                <div className="manif">
                  {meta.fallen.slice(0, 8).map((f, i) => (
                    <div key={`${f.name}-${i}`} className="fallenRow">
                      <span className="fn">{f.name}</span> · {UD[f.kind].n}
                      <span className="fd">
                        {' '}
                        — {f.raids > 0 ? `${f.raids} raids, then` : 'lost'} depth {f.depth}
                      </span>
                    </div>
                  ))}
                  {meta.fallen.length > 8 && (
                    <div className="fd" style={{ marginTop: 4 }}>
                      …and {meta.fallen.length - 8} more the dark still keeps.
                    </div>
                  )}
                </div>
              </div>
            )}
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
              <div className="rows">
                {board.k === 'loading' && <div className="r">reading the board…</div>}
                {board.k === 'down' && <div className="r">nobody is answering the board tonight</div>}
                {board.k === 'empty' && <div className="r">nobody has come back from this one yet</div>}
                {board.k === 'ok' &&
                  board.standing.top.slice(0, 5).map((r, i) => (
                    <div className={`r${r.you ? ' you' : ''}`} key={`${r.n}-${i}`}>
                      <span>{i + 1}</span>
                      <b>{r.n}</b>
                      <span>{fmt(r.s)}g</span>
                    </div>
                  ))}
                {board.k === 'ok' && board.standing.me && !board.standing.top.slice(0, 5).some((r) => r.you) && (
                  <div className="r you">
                    <span>{board.standing.rank}</span>
                    <b>{board.standing.me.n}</b>
                    <span>{fmt(board.standing.me.s)}g</span>
                  </div>
                )}
              </div>
            </div>

            {/* The rival — the next name up the board, and the exact gap to it.
                The reason to open the game tomorrow when tonight went fine. */}
            {board.k === 'ok' && board.standing.rival && (
              <div className="panelBox rivalBox">
                <div className="lbl" style={{ marginBottom: 4 }}>
                  YOUR RIVAL TONIGHT
                </div>
                <div className="rivalName">
                  {board.standing.rival.n}
                  <span className="rivalScore"> · {fmt(board.standing.rival.s)}g</span>
                </div>
                <div className="rivalGap">
                  {board.standing.me
                    ? `${fmt(board.standing.rival.gap)}g ahead of you — take it back.`
                    : `the mark to beat tonight — ${fmt(board.standing.rival.gap)}g.`}
                </div>
              </div>
            )}

            {/* The whisper network — anonymised intel on what tonight's raiders
                did at this depth, so a player knows what they walk into. */}
            {intel.k === 'ok' && (
              <div className="panelBox intelBox">
                <div className="lbl" style={{ marginBottom: 4 }}>
                  WHISPERS FROM DEPTH {meta.depth}
                </div>
                <div className="intelLine">
                  <b>{fmt(intel.intel.players)}</b> came back · avg <b>{fmt(intel.intel.avgLoot)}g</b> · best{' '}
                  <b>{fmt(intel.intel.bestLoot)}g</b>
                </div>
                {(() => {
                  const notes = INTEL_LABELS.filter((l) => (intel.intel.verdicts[l.id] ?? 0) > 0).map((l) =>
                    l.word(intel.intel.verdicts[l.id] as number),
                  );
                  return notes.length ? <div className="intelNotes">{notes.join(' · ')}</div> : null;
                })()}
              </div>
            )}
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
              : grandNight
                ? `🔥 RAID THE GRAND VAULT — DEPTH ${meta.depth}`
                : `⚔ RAID THE LAIR — DEPTH ${meta.depth}`}
          </button>
        </div>
      </div>
      <Toast />
    </>
  );
}
