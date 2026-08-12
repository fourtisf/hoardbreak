/**
 * The simulation — a direct port of the prototype's `update` loop.
 *
 * Three deliberate departures from `HOARDBREAK_v0.2.html`, all required by the
 * handoff and none of which change game feel:
 *
 *  1. Fixed 60 Hz timestep (§4). `step()` always advances by `SIM_DT`; the
 *     renderer interpolates between ticks.
 *  2. Every `Math.random()` inside the sim is now the seeded `rngSim` stream
 *     (§4), so a run can be re-simulated from its seed + input log (§6 v2).
 *  3. `setTimeout` (telegraphed breath, the slain-dragon fanfare) became
 *     `state.timers`, because wall-clock callbacks cannot be replayed.
 *
 * Nothing here touches the DOM, audio, or meta state. Sound and log lines are
 * emitted into `state.out` for the host to drain; meta changes are reported in
 * the `RunResult` for the meta layer (Phase 2: the server) to apply.
 */

import {
  GD,
  H,
  RELICS,
  RELIC_KEYS,
  SIM_DT,
  SPAWN,
  T,
  TC,
  TR,
  TUNING,
  UD,
  W,
  lvlOf,
  type ItemKey,
  type ModDef,
  type RelicKey,
} from './defs.js';
import { bfs, blockedPx, gi, revealAround, tileOf, walk } from './grid.js';
import { createRng } from './rng.js';
import { simSeedFrom } from './daily.js';
import { depthRules } from './depth.js';
import { genLair, spawnGuard } from './gen.js';
import { clamp, dist } from './util.js';
import type {
  EventCode,
  FeedClass,
  Fx,
  Guard,
  InputFrame,
  RunCommand,
  RunMeta,
  RunOutput,
  RelicOffer,
  RunSnapshot,
  RunState,
  SoundCue,
  Tele,
  Unit,
  Walker,
} from './types.js';
import { IDLE_INPUT } from './types.js';

/* ================= output plumbing ================= */

function feed(s: RunState, msg: string, cls: FeedClass = ''): void {
  s.out.feed.push({ msg, cls });
}

function snd(s: RunState, f: number, d?: number, type?: SoundCue['type'], v?: number, slide?: number, delay?: number): void {
  s.out.sounds.push({ f, d, type, v, slide, delay });
}

function toast(s: RunState, msg: string): void {
  s.out.toasts.push(msg);
}

function emit(s: RunState, code: EventCode, value: number): void {
  s.events.push([Math.round(s.t * 1000), code, Math.round(value)]);
}

/** Takes everything the sim has said since the last drain. */
export function drainOutput(s: RunState): RunOutput {
  const out = s.out;
  s.out = { feed: [], sounds: [], toasts: [], squadDirty: false };
  return out;
}

/* ================= wake ================= */

export function addWake(s: RunState, n: number): void {
  if (s.over || s.dragon.awake) return;
  s.wake = Math.min(
    TUNING.WAKE_MAX,
    s.wake +
      n *
        Math.pow(TUNING.INCENSE_MUL, s.meta.up.inc) *
        (s.mod.wakeMul || 1) *
        (s.relics.boots ? TUNING.BOOTS_MUL : 1),
  );
}

function wakeDragon(s: RunState): void {
  const D = s.dragon;
  if (D.awake) return;
  D.awake = true;
  emit(s, 'WAKE_MILESTONE', 100);
  s.banner = { t1: 'THE WYRM WAKES', t2: s.wakeCall, l: TUNING.BANNER_WAKE, l0: TUNING.BANNER_WAKE };
  s.shake = 10;
  feed(s, 'The mountain itself opens its eyes.', 'e');
  snd(s, 35, 1.2, 'sawtooth', 0.13, 30);
  revealAround(s.revealed, D.x, D.y, TUNING.REVEAL_R_WAKE);
}

/* ================= relics ================= */

/**
 * The shrine's payoff (v0.3).
 *
 * The prototype rolled one relic and handed it over, so a run contained no
 * build decision. The shrine now lays two out on either side of itself and the
 * crew walks into the one they want — the loser vanishes. Everything else is
 * unchanged: the overflow case still pays 200 g, and the relic pool and their
 * effects are the prototype's.
 */
function offerRelics(s: RunState): void {
  const left = RELIC_KEYS.filter((k) => !s.relics[k]);
  if (!left.length) {
    s.loot += TUNING.SHRINE_OVERFLOW;
    if (s.shrine) {
      s.fx.push({ k: 'txt', x: s.shrine.x, y: s.shrine.y - 14, txt: '+200g', c: '#ffd75e', l: 1, l0: 1 });
    }
    return;
  }
  const sh = s.shrine;
  if (!sh) return;

  // one relic left is not a choice — hand it over rather than stage a fake one
  if (left.length === 1) {
    takeRelic(s, { k: left[0] as RelicKey, x: sh.x, y: sh.y });
    return;
  }

  // draw without replacement so the two offers are never the same relic
  const picks: RelicKey[] = [];
  const pool = left.slice();
  while (picks.length < 2 && pool.length) {
    picks.push(pool.splice(s.rngSim.int(0, pool.length - 1), 1)[0] as RelicKey);
  }

  const gap = TUNING.RELIC_OFFER_GAP * T;
  picks.forEach((k, i) => {
    s.relicOffers.push({ k, x: sh.x + (i === 0 ? -gap : gap), y: sh.y });
  });

  s.banner = {
    t1: 'THE SHRINE OPENS',
    t2: 'take one — the other crumbles',
    l: TUNING.BANNER_RELIC,
    l0: TUNING.BANNER_RELIC,
  };
  feed(s, 'Two relics, one hand. Choose.', 'w');
  snd(s, 660, 0.12, 'triangle', 0.07);
}

/** Somebody walked into an offered relic — they take it, the rest crumble. */
function takeRelic(s: RunState, o: RelicOffer): void {
  s.relics[o.k] = 1;
  s.relicOffers.length = 0;
  emit(s, 'RELIC', RELIC_KEYS.indexOf(o.k));
  s.banner = {
    t1: 'RELIC',
    t2: `${RELICS[o.k].n} — ${RELICS[o.k].d}`,
    l: TUNING.BANNER_RELIC,
    l0: TUNING.BANNER_RELIC,
  };
  feed(s, `◆ ${RELICS[o.k].n}`, 'w');
  s.fx.push({ k: 'burst', x: o.x, y: o.y, l: 0.4, l0: 0.4 });
  snd(s, 660, 0.12, 'triangle', 0.07);
  snd(s, 880, 0.16, 'triangle', 0.06, undefined, 130);
}

/* ================= items ================= */

const ITEM_INDEX: Record<ItemKey, number> = { smoke: 0, lull: 1, trap: 2 };

export function useItem(s: RunState, k: ItemKey): boolean {
  if (s.over) return false;
  if (s.items[k] <= 0) {
    toast(s, `Out of ${k}s — buy more at the hideout`);
    return false;
  }
  if (k === 'smoke') {
    s.items.smoke--;
    s.itemsUsed.smoke++;
    s.smokeT = TUNING.SMOKE_TIME;
    for (const g of s.guards) {
      g.alert = false;
      g.path = null;
    }
    for (const u of s.units) s.fx.push({ k: 'smoke', x: u.x, y: u.y, l: 0.8, l0: 0.8 });
    feed(s, 'Smoke. The guards grasp at shadows.', 'k');
    snd(s, 200, 0.3, 'sine', 0.06, -80);
  }
  if (k === 'lull') {
    if (s.dragon.awake) {
      toast(s, 'Too late for lullabies');
      return false;
    }
    s.items.lull--;
    s.itemsUsed.lull++;
    s.wake = Math.max(0, s.wake - TUNING.LULL_WAKE);
    s.fx.push({
      k: 'txt',
      x: s.dragon.x,
      y: s.dragon.y - 34,
      txt: '♪ −25 wake',
      c: '#8fd4ff',
      l: 1.4,
      l0: 1.4,
    });
    feed(s, 'The powder settles. The snoring deepens.', 'k');
    snd(s, 523, 0.3, 'sine', 0.05, -100);
  }
  if (k === 'trap') {
    s.items.trap--;
    s.itemsUsed.trap++;
    const L = s.units[0];
    if (L) s.traps.push({ x: L.x, y: L.y, armed: true });
    feed(s, 'Bear trap set. Mind your own toes.', 'k');
    snd(s, 300, 0.06, 'square', 0.05);
  }
  emit(s, 'ITEM_USE', ITEM_INDEX[k]);
  return true;
}

/* ================= combat ================= */

function dmgGuard(g: Guard, amt: number): void {
  if (g.hex > 0) amt *= TUNING.HEX_MUL;
  g.hp -= amt;
}

/** Walks `o` one tick along a BFS path toward tile (tx, ty). True on arrival. */
function follow(s: RunState, o: Walker, tx: number, ty: number, spd: number, dt: number): boolean {
  const ox = clamp((o.x / T) | 0, 0, TC - 1);
  const oy = clamp((o.y / T) | 0, 0, TR - 1);
  const tt = gi(tx, ty);
  if (o.ptile !== tt || !o.path) {
    o.path = bfs(s.grid, ox, oy, tx, ty);
    o.pi = 0;
    o.ptile = tt;
  }
  if (!o.path) return false;
  const node = o.path[Math.min(o.pi, o.path.length - 1)] as { x: number; y: number };
  const nx = node.x * T + T / 2;
  const ny = node.y * T + T / 2;
  const dd = dist(o.x, o.y, nx, ny);
  if (dd < 3) {
    if (o.pi < o.path.length - 1) o.pi++;
    else return true;
  } else {
    if (Math.abs(nx - o.x) > 2) o.face = nx - o.x > 0 ? 1 : -1;
    o.x += ((nx - o.x) / dd) * spd * dt;
    o.y += ((ny - o.y) / dd) * spd * dt;
  }
  return false;
}

/** Crew movement multiplier for this tick — creeping halves the pace. */
function crewSpeed(s: RunState): number {
  return s.creep ? TUNING.CREEP_SPEED_MUL : 1;
}

export function unitDmgMul(s: RunState, u: Unit): number {
  return (1 + TUNING.UP_DMG_PER_LEVEL * s.meta.up.dmg) * (1 + TUNING.XP_STAT_PER_LEVEL * u.lv) * (1 + s.runDmg);
}

/**
 * Who a thief goes for, by class (v0.3).
 *
 * In the prototype every class swung at whatever was nearest, so a five-class
 * roster read as five stat blocks. This expresses each class's fantasy through
 * target selection alone — no new abilities, no new buttons, no new UI, and the
 * bias is small enough that "nearest" still usually wins.
 */
function targetBias(u: Unit, g: Guard): number {
  // Sticking to a target matters more than any class preference: without it a
  // unit ping-pongs between two guards every tick and kills neither.
  const sticky = u.tgt !== null && g.gid === u.tgt ? TUNING.TARGET_STICKY : 0;
  switch (u.k) {
    // the hex is a damage amp — it belongs on the biggest thing in the room,
    // and refreshing it on the same target is free, so no penalty for re-hexing
    case 'hexer':
      return sticky + g.max / 200;
    // ignite is damage over time: stacking it on one body wastes it, so nudge
    // the Emberkin toward whoever is not already alight
    case 'emberkin':
      return sticky + (g.burn > 0 ? -TUNING.TARGET_STICKY - 1 : 0);
    // the bruiser is a body: he goes where the hardest hits are coming from
    case 'bruiser':
      return sticky + GD[g.k].dps / 4;
    // the picklock wants to be anywhere else, and the golem's slam already
    // finds crowds on its own
    default:
      return sticky;
  }
}

function unitStep(s: RunState, u: Unit, dt: number): void {
  const d = UD[u.k];
  const rng = s.rngSim;

  if (u.k === 'golem') {
    u.slam -= dt;
    if (u.slam <= 0) {
      let near = false;
      for (const g of s.guards) {
        if (dist(u.x, u.y, g.x, g.y) < (d.slamR as number) * T) {
          near = true;
          break;
        }
      }
      if (near) {
        u.slam = d.slamCd as number;
        s.fx.push({ k: 'slam', x: u.x, y: u.y, l: 0.4, l0: 0.4 });
        s.shake = 4;
        addWake(s, TUNING.WAKE_SLAM);
        snd(s, 55, 0.3, 'sawtooth', 0.09, 15);
        for (const g of s.guards) {
          if (dist(u.x, u.y, g.x, g.y) < (d.slamR as number) * T) {
            dmgGuard(g, (d.slamDmg as number) * unitDmgMul(s, u));
            g.stun = Math.max(g.stun, d.stun as number);
          }
        }
      }
    }
  }

  let tgt: Guard | null = null;
  let td = 1e9;
  let bestScore = -Infinity;
  for (const g of s.guards) {
    if (!s.revealed[tileOf(g.x, g.y)]) continue;
    const dd = dist(u.x, u.y, g.x, g.y);
    if (dd >= TUNING.UNIT_TARGET_R * T) continue;
    // nearest still wins by default; class bias only breaks ties within reach
    const score = targetBias(u, g) - dd / T;
    if (score > bestScore) {
      bestScore = score;
      td = dd;
      tgt = g;
    }
  }
  u.tgt = tgt ? tgt.gid : null;

  let hitDragon = false;
  if (!tgt && s.dragon.awake) {
    const dd = dist(u.x, u.y, s.dragon.x, s.dragon.y);
    if (dd < Math.max(d.range, TUNING.UNIT_MIN_DRAGON_R) * T + 16) {
      hitDragon = true;
      td = dd;
    }
  }

  if (tgt) {
    if (td <= d.range * T) {
      u.cd -= dt;
      dmgGuard(tgt, d.dps * dt * unitDmgMul(s, u));
      if (u.k === 'hexer') tgt.hex = UD.hexer.hex as number;
      if (u.k === 'emberkin') tgt.burn = UD.emberkin.burn as number;
      if (u.cd <= 0) {
        u.cd = TUNING.UNIT_SWING_CD;
        const chunk = Math.max(
          1,
          Math.round(d.dps * TUNING.UNIT_SWING_CD * unitDmgMul(s, u) * (tgt.hex > 0 ? TUNING.HEX_MUL : 1)),
        );
        s.fx.push({
          k: 'txt',
          x: tgt.x + rng.range(-6, 6),
          y: tgt.y - 16,
          txt: `${chunk}`,
          c: '#d8ffe8',
          s: 9,
          l: 0.6,
          l0: 0.6,
        });
        if (d.range > 2) {
          s.fx.push({ k: 'arrow', x1: u.x, y1: u.y - 6, x2: tgt.x, y2: tgt.y, l: 0.13, l0: 0.13, c: '#8affc0' });
        } else {
          s.fx.push({ k: 'slash', x: tgt.x, y: tgt.y, l: 0.12, l0: 0.12 });
        }
      }
      return;
    }
    if (u === s.units[0] && u.steer) return;
    follow(s, u, clamp((tgt.x / T) | 0, 0, TC - 1), clamp((tgt.y / T) | 0, 0, TR - 1), d.spd * crewSpeed(s), dt);
    return;
  }

  if (hitDragon) {
    const D = s.dragon;
    D.hp -= d.dps * dt * unitDmgMul(s, u);
    u.cd -= dt;
    if (u.cd <= 0) {
      u.cd = TUNING.UNIT_SWING_CD;
      const chunk = Math.max(1, Math.round(d.dps * TUNING.UNIT_SWING_CD * unitDmgMul(s, u)));
      s.fx.push({
        k: 'txt',
        x: D.x + rng.range(-10, 10),
        y: D.y - 24,
        txt: `${chunk}`,
        c: '#d8ffe8',
        s: 9,
        l: 0.6,
        l0: 0.6,
      });
      s.fx.push({ k: 'slash', x: D.x + rng.range(-14, 14), y: D.y + rng.range(-8, 8), l: 0.12, l0: 0.12 });
    }
    if (D.hp <= 0 && !s.slain) {
      s.slain = true;
      s.loot += TUNING.SLAY_BONUS;
      s.fx.push({ k: 'burst', x: D.x, y: D.y, l: 0.6, l0: 0.6 });
      s.shake = 10;
      feed(s, 'THE WYRM IS SLAIN. Take everything.', 'w');
      s.timers.push({ k: 'endSlain', t: TUNING.SLAY_END_DELAY });
    }
    return;
  }

  const leader = s.units[0] as Unit;
  const sm = crewSpeed(s);

  // a posting given to this thief alone beats anything the crew was told
  if (u.ord && !(u === leader && u.steer)) {
    const done = follow(s, u, u.ord.x, u.ord.y, d.spd * sm, dt);
    if (done) u.path = null;
    return; // arriving does not release them: they were told to hold
  }

  const crewCmd = s.cmdOnly === null ? s.cmd : null;
  if (u === leader) {
    if (!u.steer && crewCmd) {
      const done = follow(s, u, crewCmd.x, crewCmd.y, d.spd * sm, dt);
      if (done) u.path = null;
    }
    return;
  }
  if (crewCmd) {
    const done = follow(s, u, crewCmd.x, crewCmd.y, d.spd * sm, dt);
    if (done) u.path = null;
    return;
  }
  if (dist(u.x, u.y, leader.x, leader.y) > TUNING.FOLLOW_LEASH * T) {
    follow(
      s,
      u,
      clamp((leader.x / T) | 0, 0, TC - 1),
      clamp((leader.y / T) | 0, 0, TR - 1),
      d.spd * TUNING.FOLLOW_SPEED_MUL * sm,
      dt,
    );
  }
}

function guardStep(s: RunState, g: Guard, dt: number): void {
  const d = GD[g.k];
  const rng = s.rngSim;

  if (g.hex > 0) g.hex -= dt;
  if (g.burn > 0) {
    g.burn -= dt;
    dmgGuard(g, TUNING.BURN_DPS * dt);
    if (rng.next() < dt * 6) s.fx.push({ k: 'ember', x: g.x + rng.range(-4, 4), y: g.y - 10, l: 0.35, l0: 0.35 });
  }
  if (g.stun > 0) {
    g.stun -= dt;
    return;
  }

  // bear traps snap guards
  for (const tp of s.traps) {
    if (!tp.armed) continue;
    if (dist(g.x, g.y, tp.x, tp.y) < TUNING.TRAP_GUARD_R) {
      tp.armed = false;
      dmgGuard(g, TUNING.TRAP_GUARD_DMG);
      g.stun = Math.max(g.stun, TUNING.TRAP_GUARD_STUN);
      s.fx.push({ k: 'slash', x: g.x, y: g.y, l: 0.2, l0: 0.2 });
      snd(s, 700, 0.08, 'square', 0.06);
    }
  }

  if (!g.alert) {
    if (s.smokeT > 0) return;
    const aR =
      Math.max(0, TUNING.DETECT_R + (s.mod.alertAdd || 0)) *
      T *
      (s.relics.cloak ? TUNING.CLOAK_MUL : 1) *
      (s.creep ? TUNING.CREEP_DETECT_MUL : 1);
    for (const u of s.units) {
      if (dist(g.x, g.y, u.x, u.y) < aR && s.revealed[tileOf(g.x, g.y)]) {
        g.alert = true;
        s.everSpotted = true;
        addWake(s, TUNING.WAKE_GUARD_ALERT);
        s.fx.push({ k: 'txt', x: g.x, y: g.y - 18, txt: '!', c: '#ff5a6e', l: 0.8, l0: 0.8 });
        snd(s, 500, 0.07, 'square', 0.05);
        break;
      }
    }
    if (!g.alert) return;
  }
  if (s.smokeT > 0) return;

  if (g.k === 'acolyte') {
    let low: Guard | null = null;
    let lm = 1;
    for (const o of s.guards) {
      if (o === g) continue;
      const r = o.hp / o.max;
      if (r < lm && dist(g.x, g.y, o.x, o.y) < 3 * T) {
        lm = r;
        low = o;
      }
    }
    if (low) {
      low.hp = Math.min(low.max, low.hp + (d.heal as number) * dt);
      if (rng.next() < dt * 3) s.fx.push({ k: 'heal', x: low.x, y: low.y, l: 0.4, l0: 0.4 });
    }
  }

  let tgt: Unit | null = null;
  let td = 1e9;
  for (const u of s.units) {
    if (u.k === 'bruiser' && dist(g.x, g.y, u.x, u.y) < (UD.bruiser.taunt as number) * T) {
      tgt = u;
      td = dist(g.x, g.y, u.x, u.y);
      break;
    }
  }
  if (!tgt) {
    for (const u of s.units) {
      const dd = dist(g.x, g.y, u.x, u.y);
      if (dd < td) {
        td = dd;
        tgt = u;
      }
    }
  }
  if (!tgt) return;

  // Under lockdown a guard stops chasing and goes to hold the door. Anyone who
  // walks into arm's reach still gets hit — they are not sleepwalking — but
  // they will not be drawn across the lair by a thief they can see. That is
  // what makes the way home the problem instead of the room you are standing in.
  if (s.sealed && td > TUNING.SEAL_ENGAGE_R * T) {
    const slot = s.exitTiles[g.gid % s.exitTiles.length] as number;
    follow(s, g, slot % TC, (slot / TC) | 0, d.spd * TUNING.SEAL_SPEED_MUL, dt);
    return;
  }

  if (td <= d.range * T) {
    g.cd -= dt;
    tgt.hp -= d.dps * dt;
    if (g.cd <= 0) {
      g.cd = TUNING.GUARD_SWING_CD;
      s.fx.push({
        k: 'txt',
        x: tgt.x + rng.range(-6, 6),
        y: tgt.y - 16,
        txt: `${Math.max(1, Math.round(d.dps * TUNING.GUARD_SWING_CD))}`,
        c: '#ff9aa6',
        s: 9,
        l: 0.55,
        l0: 0.55,
      });
      if (d.range > 2) {
        s.fx.push({ k: 'arrow', x1: g.x, y1: g.y - 6, x2: tgt.x, y2: tgt.y, l: 0.13, l0: 0.13, c: '#ffe89e' });
      } else {
        s.fx.push({ k: 'slash', x: tgt.x, y: tgt.y, l: 0.12, l0: 0.12 });
      }
    }
  } else {
    follow(s, g, clamp((tgt.x / T) | 0, 0, TC - 1), clamp((tgt.y / T) | 0, 0, TR - 1), d.spd, dt);
  }
}

/* ================= dragon (staged) ================= */

function sleepBreath(s: RunState): void {
  const alive = s.units;
  if (!alive.length) return;
  let cx = 0;
  let cy = 0;
  for (const u of alive) {
    cx += u.x;
    cy += u.y;
  }
  cx /= alive.length;
  cy /= alive.length;
  let tx = cx;
  let ty = cy;
  for (let i = 0; i < 12; i++) {
    const ax = cx + s.rngSim.range(-4, 4) * T;
    const ay = cy + s.rngSim.range(-4, 4) * T;
    const gx = clamp((ax / T) | 0, 0, TC - 1);
    const gy = clamp((ay / T) | 0, 0, TR - 1);
    if (walk(s.grid, gx, gy) && s.revealed[gi(gx, gy)]) {
      tx = ax;
      ty = ay;
      break;
    }
  }
  s.tele.push({ x: tx, y: ty, l: TUNING.SLEEP_BREATH_TELE });
  snd(s, 60, 0.4, 'sawtooth', 0.06, 60);
  s.timers.push({
    k: 'blast',
    t: TUNING.SLEEP_BREATH_TELE,
    x: tx,
    y: ty,
    dmg: TUNING.SLEEP_BREATH_DMG * (s.mod.breathMul || 1),
    shake: 4,
    snd: { f: 45, d: 0.3, type: 'sawtooth', v: 0.09, slide: 20 },
  });
}

/**
 * A sleeping dragon should not be scenery.
 *
 * For the whole first half of a run the wyrm was a wake meter with a sprite
 * attached: it never moved, and the tile it slept on was the safest square in
 * the lair right up until the moment it was the deadliest. Now it heaves over
 * onto a new patch of its bed, and every so often its tail comes round across
 * the gold. Both are telegraphed, both are dodgeable, and between them the
 * hoard stops being somewhere you can park.
 *
 * It also gives the deep gold (`DEEP_R`) legs — the ring that pays double moves
 * when the wyrm does, so working it means following a sleeping animal around
 * rather than standing still on top of one.
 */
function stir(s: RunState): void {
  const D = s.dragon;
  const rng = s.rngSim;
  const hh = s.hoard;

  // the tail only comes into it once it is sleeping badly
  if (s.stage >= 1 && rng.next() < TUNING.TAIL_CHANCE) {
    s.timers.push({ k: 'tail', t: TUNING.STIR_TELE });
    for (let gx = hh.x0; gx <= hh.x1; gx++) {
      s.tele.push({ x: (gx + 0.5) * T, y: (hh.y0 + hh.y1 + 1) * 0.5 * T, l: TUNING.STIR_TELE });
    }
    feed(s, 'Its tail draws back across the gold.', 'e');
    snd(s, 70, 0.35, 'sawtooth', 0.05, -20);
    return;
  }

  // pick a fresh patch of bed, far enough that moving there means something
  let tx = D.x;
  let ty = D.y;
  for (let i = 0; i < 10; i++) {
    const cx = (rng.int(hh.x0, hh.x1) + 0.5) * T;
    const cy = (rng.int(hh.y0, hh.y1) + 0.5) * T;
    if (dist(cx, cy, D.x, D.y) < T) continue;
    tx = cx;
    ty = cy;
    break;
  }
  if (tx === D.x && ty === D.y) return;

  s.timers.push({ k: 'roll', t: TUNING.STIR_TELE, x: tx, y: ty });
  s.tele.push({ x: tx, y: ty, l: TUNING.STIR_TELE });
  snd(s, 55, 0.4, 'sine', 0.05, -14);
}

/** The wyrm lands: anyone still under it is crushed and thrown clear. */
function landRoll(s: RunState, x: number, y: number): void {
  const D = s.dragon;
  D.x = x;
  D.y = y;
  D.px = x;
  D.py = y;
  s.shake = Math.max(s.shake, 4);
  s.fx.push({ k: 'slam', x, y, l: 0.35, l0: 0.35 });
  snd(s, 48, 0.35, 'sawtooth', 0.07, -18);
  for (const u of s.units) {
    if (dist(u.x, u.y, x, y) > TUNING.ROLL_R * T) continue;
    u.hp -= TUNING.ROLL_DMG;
    shoveFrom(s, u, x, y);
    s.fx.push({ k: 'txt', x: u.x, y: u.y - 16, txt: 'CRUSHED', c: '#ff9aa6', s: 9, l: 0.7, l0: 0.7 });
  }
}

/** The tail comes round: everyone on the pile takes it and is swept off. */
function sweepTail(s: RunState): void {
  const hh = s.hoard;
  const D = s.dragon;
  s.shake = Math.max(s.shake, 5);
  s.fx.push({ k: 'slam', x: (hh.x0 + hh.x1 + 1) * 0.5 * T, y: (hh.y0 + hh.y1 + 1) * 0.5 * T, l: 0.4, l0: 0.4 });
  snd(s, 62, 0.45, 'sawtooth', 0.08, -26);
  for (const u of s.units) {
    const gx = (u.x / T) | 0;
    const gy = (u.y / T) | 0;
    if (!(gx >= hh.x0 && gx <= hh.x1 && gy >= hh.y0 && gy <= hh.y1)) continue;
    u.hp -= TUNING.TAIL_DMG;
    shoveFrom(s, u, D.x, D.y);
    s.fx.push({ k: 'txt', x: u.x, y: u.y - 16, txt: 'SWEPT', c: '#ff9aa6', s: 9, l: 0.7, l0: 0.7 });
  }
}

/** Throw a thief away from (x, y), but never into rock. */
function shoveFrom(s: RunState, u: Unit, x: number, y: number): void {
  let dx = u.x - x;
  let dy = u.y - y;
  let m = Math.hypot(dx, dy);
  // dead centre has no "away" — someone pinned exactly under it still has to
  // end up somewhere, or being crushed leaves them there to be crushed again
  if (m < 0.001) {
    const a = s.rngSim.range(0, Math.PI * 2);
    dx = Math.cos(a);
    dy = Math.sin(a);
    m = 1;
  }
  const nx = u.x + (dx / m) * TUNING.SHOVE;
  const ny = u.y + (dy / m) * TUNING.SHOVE;
  if (!blockedPx(s.grid, nx, u.y)) u.x = nx;
  if (!blockedPx(s.grid, u.x, ny)) u.y = ny;
  // whatever they were walking toward, they are not walking there from here
  u.path = null;
  u.ptile = -1;
}

function dragonStep(s: RunState, dt: number): void {
  const D = s.dragon;
  const rng = s.rngSim;

  if (D.stunT > 0) {
    D.stunT -= dt;
    s.shake = Math.max(s.shake, 1.5);
    return;
  }

  if (!D.awake) {
    // creeping only quiets your own footsteps — proximity, siphon and combat
    // noise are untouched, so the hoard stays as dangerous as it ever was
    addWake(s, TUNING.WAKE_PASSIVE * dt * (s.creep ? TUNING.CREEP_WAKE_MUL : 1));
    if (s.wake >= TUNING.STAGE1_WAKE && s.stage < 1) {
      s.stage = 1;
      emit(s, 'WAKE_MILESTONE', 50);
      feed(s, 'One golden eye slides open…', 'e');
      snd(s, 120, 0.5, 'sawtooth', 0.06, -60);
    }
    if (s.wake >= TUNING.STAGE2_WAKE && s.stage < 2) {
      s.stage = 2;
      emit(s, 'WAKE_MILESTONE', 75);
      feed(s, 'Its tail sweeps the gold. Guards stir.', 'e');
      spawnGuard(s, 'sentinel', s.hoard.x0 - 1, s.hoard.y0, true);
      spawnGuard(s, 'guard', s.hoard.x0 - 1, s.hoard.y1, true);
      snd(s, 90, 0.5, 'sawtooth', 0.07, -30);
    }
    if (s.stage >= 1) {
      D.scd -= dt;
      if (D.scd <= 0) {
        D.scd = s.stage >= 2 ? TUNING.SLEEP_BREATH_CD_S2 : TUNING.SLEEP_BREATH_CD;
        sleepBreath(s);
      }
    }
    // it turns over in its sleep from the first second of the run, and does it
    // more often the closer it gets to waking
    D.stir -= dt;
    if (D.stir <= 0) {
      D.stir = s.stage >= 2 ? TUNING.STIR_CD_S2 : s.stage >= 1 ? TUNING.STIR_CD_S1 : TUNING.STIR_CD;
      stir(s);
    }
    if (rng.next() < dt * 0.2) snd(s, 48, 0.35, 'sine', 0.035, -8);
    if (rng.next() < dt * 0.7) {
      s.fx.push({ k: 'txt', x: D.x + rng.range(-8, 18), y: D.y - 30, txt: 'z', c: '#5f7a6c', l: 1.4, l0: 1.4 });
    }
    for (const u of s.units) {
      if (dist(u.x, u.y, D.x, D.y) < TUNING.WAKE_NEAR_R * T) {
        addWake(s, TUNING.WAKE_NEAR_DRAGON * dt);
        break;
      }
    }
    if (s.wake >= TUNING.WAKE_MAX) wakeDragon(s);
    return;
  }

  const alive = s.units;
  if (!alive.length) return;
  let cx = 0;
  let cy = 0;
  for (const u of alive) {
    cx += u.x;
    cy += u.y;
  }
  cx /= alive.length;
  cy /= alive.length;
  const dd = dist(D.x, D.y, cx, cy);
  if (dd > 10) {
    // it flies — walls do not apply
    D.x += ((cx - D.x) / dd) * TUNING.DRAGON_SPD * dt;
    D.y += ((cy - D.y) / dd) * TUNING.DRAGON_SPD * dt;
  }
  revealAround(s.revealed, D.x, D.y, TUNING.REVEAL_R_DRAGON);

  // bear traps bite the wyrm
  for (const tp of s.traps) {
    if (!tp.armed) continue;
    if (dist(D.x, D.y, tp.x, tp.y) < TUNING.TRAP_DRAGON_R) {
      tp.armed = false;
      D.hp -= TUNING.TRAP_DRAGON_DMG;
      D.stunT = TUNING.TRAP_DRAGON_STUN;
      s.shake = 8;
      s.fx.push({ k: 'burst', x: D.x, y: D.y, l: 0.4, l0: 0.4 });
      feed(s, 'The trap bites! The wyrm screams.', 'k');
      snd(s, 90, 0.4, 'sawtooth', 0.1, -30);
    }
  }

  D.cd -= dt;
  if (D.cd <= 0) {
    D.cd = TUNING.AWAKE_BREATH_CD;
    const tx = cx;
    const ty = cy;
    s.tele.push({ x: tx, y: ty, l: TUNING.AWAKE_BREATH_TELE });
    snd(s, 50, 0.5, 'sawtooth', 0.09, 80);
    s.timers.push({
      k: 'blast',
      t: TUNING.AWAKE_BREATH_TELE,
      x: tx,
      y: ty,
      dmg: TUNING.AWAKE_BREATH_DMG * (s.mod.breathMul || 1),
      shake: 6,
      snd: { f: 45, d: 0.4, type: 'sawtooth', v: 0.11, slide: 20 },
    });
  }
}

/* ================= timers (former setTimeout callbacks) ================= */

function runTimers(s: RunState, dt: number): void {
  for (let i = s.timers.length - 1; i >= 0; i--) {
    const tm = s.timers[i] as (typeof s.timers)[number];
    tm.t -= dt;
    if (tm.t > 0) continue;
    s.timers.splice(i, 1);
    if (s.over) continue;
    if (tm.k === 'blast') {
      s.fx.push({ k: 'blast', x: tm.x, y: tm.y, l: 0.5, l0: 0.5 });
      s.shake = tm.shake;
      for (const u of s.units) {
        if (dist(u.x, u.y, tm.x, tm.y) < TUNING.BREATH_R * T) {
          u.hp -= tm.dmg * (UD[u.k].fireRes || 1) * (s.relics.ward ? TUNING.WARD_MUL : 1);
        }
      }
      s.out.sounds.push(tm.snd);
    } else if (tm.k === 'roll') {
      // a wyrm that woke up mid-heave is busy with worse things
      if (!s.dragon.awake) landRoll(s, tm.x, tm.y);
    } else if (tm.k === 'tail') {
      if (!s.dragon.awake) sweepTail(s);
    } else {
      endRun(s, true, true);
      return;
    }
  }
}

/* ================= run end ================= */

function isCrewTid(s: RunState, tid: number): boolean {
  return s.meta.crew.some((t) => t.tid === tid);
}

/**
 * The prototype spliced the roster inline; here the change is *recorded* and
 * the meta layer replays it, so the same code path works client-side in Phase 1
 * and server-side from Phase 2 on.
 */
function loseThief(s: RunState, u: Unit): void {
  s.crewLost++;
  if (isCrewTid(s, u.tid)) s.crewOps.push({ op: 'lose', tid: u.tid });
}

export function inZone(s: RunState, u: Unit): boolean {
  return s.exitTiles.includes(tileOf(u.x, u.y));
}

export function extractReady(s: RunState): number {
  let n = 0;
  for (const u of s.units) if (inZone(s, u)) n++;
  return n;
}

/**
 * Give up and run for it (v0.3).
 *
 * A doomed run otherwise wastes two real minutes waiting to die, so the player
 * needs a way out — but it cannot be free. A failed run only ever costs you the
 * thieves who actually fell, so "abandon" with the crew alive would have been a
 * free scouting trip: walk in, learn today's lair, quit, walk back in and run it
 * perfectly. The daily only means something if everyone gets one shot at it.
 *
 * So abandoning is exactly a wipe: the loot stays in the mountain and the crew
 * does not come out. What it buys you is the two minutes, not the consequences.
 */
export function abandonRun(s: RunState): void {
  if (s.over) return;
  for (const u of s.units) {
    if (!u.rescued) loseThief(s, u);
    else s.crewLost++;
    feed(s, `${u.name} never came back out of the dark.`, 'e');
  }
  s.units.length = 0;
  endRun(s, false);
}

export function endRun(s: RunState, success: boolean, slain = false): void {
  if (s.over) return;
  s.over = true;
  flushSiphon(s);

  const stolenPct = s.hoard ? Math.round(100 * (1 - s.hoard.pool / s.hoard.pool0)) : 0;
  const survivorsTids: number[] = [];
  let rescuedTid: number | null = null;

  if (success) {
    for (const u of s.units) {
      if (!inZone(s, u) && !slain) {
        loseThief(s, u);
        feed(s, `${u.name} left behind in the dark…`, 'e');
        continue;
      }
      if (isCrewTid(s, u.tid)) survivorsTids.push(u.tid);
      else if (u.rescued && s.rescue) {
        s.rescue.extracted = true;
        rescuedTid = u.tid;
      }
    }
    emit(s, 'EXTRACT', s.loot);
    snd(s, 392, 0.15, 'triangle', 0.07);
    snd(s, 523, 0.18, 'triangle', 0.06, undefined, 140);
    snd(s, 659, 0.25, 'triangle', 0.06, undefined, 290);
  } else {
    snd(s, 80, 0.7, 'sawtooth', 0.09, -40);
  }

  s.result = {
    success,
    slain,
    loot: Math.round(s.loot),
    stolenPct,
    guardsSlain: s.guardsSlain,
    crewLost: s.crewLost,
    wake: Math.round(s.wake),
    durationMs: Math.round(s.t * 1000),
    crewLostTids: s.crewOps.filter((o) => o.op === 'lose').map((o) => o.tid),
    survivorsTids,
    rescuedTid,
    rescue: s.rescue,
    itemsUsed: { ...s.itemsUsed },
    everSpotted: s.everSpotted,
    crewOps: s.crewOps.slice(),
    events: s.events.slice(),
  };
}

/* ================= siphon event batching ================= */

function flushSiphon(s: RunState): void {
  if (s.siphonAcc >= 1) {
    emit(s, 'SIPHON_TICK', s.siphonAcc);
    s.siphonAcc = 0;
  }
}

/* ================= the lockdown ================= */

/**
 * Half the hoard is gone, and a hoard that size does not go quietly.
 *
 * Every guard drops what it was doing and marches for the entrance. Nothing is
 * hidden from the player: the banner says it, the exit tiles change colour, and
 * it fires on a threshold they crossed themselves one coin at a time.
 *
 * This is also what makes GHOST mean something. A run where the alarm never
 * went up is now a run that left before taking half — the greedy line and the
 * clean line pull in opposite directions instead of both being "stay longer".
 */
function sealTheDoor(s: RunState): void {
  s.sealed = true;
  s.everSpotted = true;
  for (const g of s.guards) {
    g.alert = true;
    g.path = null;
    g.ptile = -1;
  }
  s.banner = { t1: 'THE DOOR IS HELD', t2: 'they are between you and the night', l: TUNING.BANNER_SEAL, l0: TUNING.BANNER_SEAL };
  feed(s, 'Half the hoard is gone. Every guard turns for the entrance.', 'e');
  s.shake = Math.max(s.shake, 5);
  snd(s, 150, 0.5, 'sawtooth', 0.08, -70);
  snd(s, 90, 0.6, 'square', 0.05, undefined, 120);
}

/* ================= the tick ================= */

function update(s: RunState, dt: number, input: InputFrame): void {
  runTimers(s, dt);
  if (s.over) return;

  s.creep = input.creep === true;
  s.smokeT = Math.max(0, s.smokeT - dt);

  if (s.units.length) {
    const L = s.units[0] as Unit;
    if (input.mm > TUNING.STEER_DEADZONE) {
      s.cmd = null;
      L.steer = true;
      const sp = UD[L.k].spd * TUNING.LEADER_SPEED_MUL * crewSpeed(s) * dt * input.mm;
      const nx = L.x + input.mx * sp;
      const ny = L.y + input.my * sp;
      if (!blockedPx(s.grid, nx, ny)) {
        L.x = nx;
        L.y = ny;
      } else if (!blockedPx(s.grid, nx, L.y)) L.x = nx;
      else if (!blockedPx(s.grid, L.x, ny)) L.y = ny;
      L.x = clamp(L.x, 8, W - 8);
      L.y = clamp(L.y, 8, H - 8);
      if (Math.abs(input.mx) > 0.25) L.face = input.mx > 0 ? 1 : -1;
    } else L.steer = false;
  }

  for (const u of s.units) unitStep(s, u, dt);
  for (const g of s.guards) guardStep(s, g, dt);
  dragonStep(s, dt);

  /* loot piles */
  for (let i = s.piles.length - 1; i >= 0; i--) {
    const p = s.piles[i] as (typeof s.piles)[number];
    for (const u of s.units) {
      if (dist(u.x, u.y, p.x, p.y) < TUNING.PILE_PICKUP_R) {
        const amt = Math.round(p.amt * (s.relics.greed ? TUNING.GREED_MUL : 1));
        s.loot += amt;
        emit(s, 'LOOT_PILE', amt);
        s.fx.push({ k: 'txt', x: p.x, y: p.y - 8, txt: `+${amt}g`, c: '#ffd75e', l: 0.9, l0: 0.9 });
        snd(s, 880, 0.05, 'square', 0.045);
        s.piles.splice(i, 1);
        break;
      }
    }
  }

  /* chests */
  for (const c of s.chests) {
    if (c.open) continue;
    let near = false;
    let mul = 1;
    for (const u of s.units) {
      if (dist(u.x, u.y, c.x, c.y) < TUNING.CHEST_R * T) {
        near = true;
        if (u.k === 'picklock') mul = Math.max(mul, UD.picklock.chestMul as number);
      }
    }
    if (s.relics.lock) mul = 99;
    if (near) {
      c.prog += dt * mul;
      if (c.prog >= TUNING.CHEST_TIME) {
        c.open = true;
        s.loot += c.amt;
        addWake(s, TUNING.WAKE_CHEST);
        emit(s, 'CHEST', c.amt);
        s.fx.push({ k: 'txt', x: c.x, y: c.y - 12, txt: `+${c.amt}g`, c: '#ffd75e', l: 1, l0: 1 });
        s.fx.push({ k: 'burst', x: c.x, y: c.y, l: 0.3, l0: 0.3 });
        snd(s, 660, 0.08, 'square', 0.05);
        snd(s, 988, 0.1, 'square', 0.04);
        feed(s, `Vault chest cracked — +${c.amt}g`, 'k');
      }
    } else c.prog = Math.max(0, c.prog - dt * TUNING.CHANNEL_DECAY);
  }

  /* shrine / armory / prison */
  if (s.shrine && !s.shrine.done) {
    let near = false;
    for (const u of s.units) if (dist(u.x, u.y, s.shrine.x, s.shrine.y) < TUNING.SHRINE_R * T) near = true;
    if (near) {
      s.shrine.prog += dt;
      if (s.shrine.prog >= TUNING.SHRINE_TIME) {
        s.shrine.done = true;
        const before = s.loot;
        offerRelics(s);
        emit(s, 'SHRINE', s.loot - before);
        addWake(s, TUNING.WAKE_SHRINE);
      }
    } else s.shrine.prog = Math.max(0, s.shrine.prog - dt * TUNING.CHANNEL_DECAY);
  }

  /* pick one of the shrine's relics up — the other crumbles */
  if (s.relicOffers.length) {
    outer: for (const o of s.relicOffers) {
      for (const u of s.units) {
        if (dist(u.x, u.y, o.x, o.y) < TUNING.RELIC_OFFER_R * T) {
          takeRelic(s, o);
          break outer;
        }
      }
    }
  }

  if (s.armory && !s.armory.done) {
    for (const u of s.units) {
      if (dist(u.x, u.y, s.armory.x, s.armory.y) < TUNING.ARMORY_R * T) {
        s.armory.done = true;
        s.runDmg += TUNING.ARMORY_DMG;
        emit(s, 'ARMORY', 1);
        feed(s, 'Old blades, still sharp. +15% crew damage.', 'k');
        s.fx.push({ k: 'txt', x: s.armory.x, y: s.armory.y - 14, txt: '+15% DMG', c: '#8affc0', l: 1.2, l0: 1.2 });
        snd(s, 700, 0.1, 'square', 0.05);
        break;
      }
    }
  }

  if (s.prison && !s.prison.done) {
    let near = false;
    for (const u of s.units) if (dist(u.x, u.y, s.prison.x, s.prison.y) < TUNING.PRISON_R * T) near = true;
    if (near) {
      s.prison.prog += dt;
      if (s.prison.prog >= TUNING.PRISON_TIME) {
        s.prison.done = true;
        const th = s.prison.thief;
        if (s.prison.fromQ) s.crewOps.push({ op: 'freeFromQueue', tid: th.tid });
        s.rescue = { thief: th, fromQueue: s.prison.fromQ, extracted: false };
        const d = UD[th.kind];
        const lv = lvlOf(th);
        const hp = d.hp * (1 + TUNING.UP_HP_PER_LEVEL * s.meta.up.hp) * (1 + TUNING.XP_STAT_PER_LEVEL * lv);
        s.units.push({
          tid: th.tid,
          name: th.name,
          k: th.kind,
          lv,
          rescued: true,
          rescuedThief: th,
          x: s.prison.x,
          y: s.prison.y + T,
          px: s.prison.x,
          py: s.prison.y + T,
          hp,
          max: hp,
          cd: 0,
          path: null,
          pi: 0,
          ptile: -1,
          face: 1,
          slam: 0,
          steer: false,
          tgt: null,
          ord: null,
          id: s.rngSim.range(0, 99),
        });
        s.out.squadDirty = true;
        addWake(s, TUNING.WAKE_RESCUE);
        emit(s, 'RESCUE', th.tid);
        feed(s, `You found ${th.name} — alive. They fight with you.`, 'w');
        s.banner = {
          t1: 'RESCUED',
          t2: `${th.name} the ${d.n} rejoins the crew`,
          l: TUNING.BANNER_RESCUE,
          l0: TUNING.BANNER_RESCUE,
        };
        snd(s, 523, 0.15, 'triangle', 0.06);
        snd(s, 659, 0.2, 'triangle', 0.06, undefined, 140);
      }
    } else s.prison.prog = Math.max(0, s.prison.prog - dt * TUNING.CHANNEL_DECAY);
  }

  /* siphon the hoard */
  const hh = s.hoard;
  if (hh.pool > 0) {
    let sip = 0;
    let pay = 0;
    let noise = 0;
    let deepest: Unit | null = null;
    for (const u of s.units) {
      const gx = (u.x / T) | 0;
      const gy = (u.y / T) | 0;
      if (!(gx >= hh.x0 && gx <= hh.x1 && gy >= hh.y0 && gy <= hh.y1)) continue;
      sip++;
      // the coins under the wyrm itself. Same hoard, different price.
      const deep = dist(u.x, u.y, s.dragon.x, s.dragon.y) <= TUNING.DEEP_R * T;
      pay += deep ? TUNING.DEEP_PAY : 1;
      noise += deep ? TUNING.DEEP_WAKE : 1;
      if (deep) deepest = u;
    }
    if (sip) {
      const raw = TUNING.SIPHON_RATE * pay * dt;
      const take = Math.min(hh.pool, raw * (s.relics.greed ? TUNING.GREED_MUL : 1));
      hh.pool -= Math.min(hh.pool, raw);
      s.loot += take;
      s.siphonAcc += take;
      if (s.siphonAcc >= TUNING.SIPHON_RATE) flushSiphon(s);
      // the cap still says "a crowd is not linearly louder"; the deep factor is
      // applied after it so digging under the wyrm always costs what it costs
      addWake(s, TUNING.WAKE_SIPHON * dt * Math.min(sip, TUNING.WAKE_SIPHON_CAP) * (noise / sip));
      if (deepest && !s.deepTold) {
        s.deepTold = true;
        feed(s, `${deepest.name} digs into the gold under the wyrm. It pays. It costs.`, 'w');
        snd(s, 330, 0.18, 'triangle', 0.05, 60);
      }
      if (s.rngSim.next() < dt * 4) {
        s.fx.push({
          k: 'txt',
          x: (hh.x0 + 1.5) * T + s.rngSim.range(-10, 10),
          y: hh.y0 * T + s.rngSim.range(0, 20),
          txt: '+g',
          c: '#ffd75e',
          l: 0.6,
          l0: 0.6,
        });
      }
      // a second, hotter stream so the deep gold reads as paying more without
      // anyone having to be told a multiplier
      if (deepest && s.rngSim.next() < dt * 5) {
        s.fx.push({
          k: 'txt',
          x: s.dragon.x + s.rngSim.range(-14, 14),
          y: s.dragon.y - 6 + s.rngSim.range(-8, 8),
          txt: '++g',
          c: '#ffae3c',
          s: 11,
          l: 0.7,
          l0: 0.7,
        });
      }
    }
  }
  if (!s.sealed && hh.pool <= hh.pool0 * (1 - depthRules(s.depth).sealAt)) sealTheDoor(s);

  /* guard deaths */
  for (let i = s.guards.length - 1; i >= 0; i--) {
    const g = s.guards[i] as Guard;
    if (g.hp <= 0) {
      s.guardsSlain++;
      s.loot += TUNING.GUARD_BOUNTY;
      addWake(s, TUNING.WAKE_GUARD_KILL);
      emit(s, 'GUARD_KILL', TUNING.GUARD_BOUNTY);
      s.fx.push({ k: 'boom', x: g.x, y: g.y, l: 0.3, l0: 0.3 });
      s.fx.push({ k: 'txt', x: g.x, y: g.y - 14, txt: '+10g', c: '#ffd75e', l: 0.8, l0: 0.8 });
      s.guards.splice(i, 1);
      snd(s, 120, 0.12, 'square', 0.05);
    }
  }

  /* crew deaths */
  for (let i = s.units.length - 1; i >= 0; i--) {
    const u = s.units[i] as Unit;
    if (u.hp <= 0) {
      if (u.k === 'picklock') {
        s.fx.push({ k: 'burst', x: u.x, y: u.y, l: 0.35, l0: 0.35 });
        for (const g of s.guards) {
          if (dist(u.x, u.y, g.x, g.y) < 1.3 * T) dmgGuard(g, UD.picklock.burst as number);
        }
        snd(s, 70, 0.18, 'sawtooth', 0.07);
      }
      if (!u.rescued) loseThief(s, u);
      else s.crewLost++;
      feed(s, `${u.name} falls in the dark.`, 'e');
      s.fx.push({ k: 'boom', x: u.x, y: u.y, l: 0.35, l0: 0.35 });
      s.units.splice(i, 1);
      s.out.squadDirty = true;
      snd(s, 130, 0.14, 'square', 0.05);
    }
  }
  if (!s.units.length) {
    endRun(s, false);
    return;
  }

  for (const u of s.units) revealAround(s.revealed, u.x, u.y, s.mod.rev || TUNING.REVEAL_R);

  /* heartbeat tension */
  if (s.wake >= TUNING.HEARTBEAT_WAKE && !s.dragon.awake) {
    s.heartT -= dt;
    if (s.heartT <= 0) {
      s.heartT = 1.5 - s.wake / 200;
      snd(s, 42, 0.12, 'sine', 0.05);
    }
  }

  for (let i = s.fx.length - 1; i >= 0; i--) if (((s.fx[i] as Fx).l -= dt) <= 0) s.fx.splice(i, 1);
  for (let i = s.tele.length - 1; i >= 0; i--) if (((s.tele[i] as Tele).l -= dt) <= 0) s.tele.splice(i, 1);
  if (s.banner && (s.banner.l -= dt) <= 0) s.banner = null;
  if (s.cmdT > 0) s.cmdT -= dt;
}

/* ================= commands ================= */

function applyCommand(s: RunState, c: RunCommand): void {
  if (s.over) return;
  if (c.c === 'move') {
    const gx = clamp(c.x, 0, TC - 1) | 0;
    const gy = clamp(c.y, 0, TR - 1) | 0;
    if (!walk(s.grid, gx, gy)) {
      toast(s, 'Solid rock — the crew can’t phase through walls');
      return;
    }
    if (c.tid !== undefined) {
      // one thief, posted. Everyone else keeps doing what they were doing.
      const one = s.units.find((u) => u.tid === c.tid);
      if (!one) return;
      one.ord = { x: gx, y: gy };
      one.path = null;
      one.ptile = -1;
      // the marker is cosmetic; `cmdOnly` stops everyone else reading it as
      // their order, which is what made a solo posting move the whole crew
      s.cmd = { x: gx, y: gy };
      s.cmdOnly = one.tid;
      s.cmdT = TUNING.CMD_MARKER_TIME * 0.6;
      feed(s, `${one.name} peels off.`);
      snd(s, 620, 0.04, 'square', 0.035);
      return;
    }
    s.cmd = { x: gx, y: gy };
    s.cmdOnly = null;
    s.cmdT = TUNING.CMD_MARKER_TIME;
    for (const u of s.units) {
      // a posted thief is NOT recalled by a crew order — otherwise "hold this
      // corridor while the rest take the gold" is impossible, which is the
      // entire reason for splitting the crew. Use `recall` to release them.
      if (u.ord) continue;
      u.path = null;
      u.ptile = -1;
    }
    snd(s, 500, 0.04, 'square', 0.04);
  } else if (c.c === 'recall') {
    const one = s.units.find((u) => u.tid === c.tid);
    if (!one || !one.ord) return;
    one.ord = null;
    one.path = null;
    one.ptile = -1;
    feed(s, `${one.name} falls back in.`);
    snd(s, 420, 0.05, 'square', 0.035);
  } else if (c.c === 'item') {
    useItem(s, c.k);
  } else if (c.c === 'extract') {
    if (extractReady(s) > 0) endRun(s, true, false);
  }
}

/* ================= public API ================= */

export interface CreateRunOptions {
  /** server-issued run seed (Phase 1: `dailySeed(date, depth)`) */
  seed: number;
  depth: number;
  mod: ModDef;
  meta: RunMeta;
  /** the daily date string this run belongs to */
  date: string;
  /** override the combat/fx stream seed (defaults to `simSeedFrom(seed)`) */
  simSeed?: number;
  /**
   * The second line of the banner when the wyrm wakes.
   *
   * It said "RUN." to everybody, including a crew the game's own numbers say
   * can kill the thing in seven seconds — the loudest text in the game, telling
   * a third of the roster's worth of players something false. The sim knows the
   * wyrm's health but not how hard this crew hits, so the host decides.
   */
  wakeCall?: string;
}

export function createRun(opts: CreateRunOptions): RunState {
  const { seed, depth, mod, meta, date } = opts;
  const simSeed = opts.simSeed ?? simSeedFrom(seed);

  const s: RunState = {
    date,
    depth,
    seed,
    simSeed,
    mod,
    rngGen: createRng(seed),
    rngSim: createRng(simSeed),
    grid: new Uint8Array(TC * TR),
    revealed: new Uint8Array(TC * TR),
    units: [],
    guards: [],
    piles: [],
    chests: [],
    traps: [],
    exitTiles: [],
    exitCtr: { x: 0, y: 0 },
    prison: null,
    shrine: null,
    armory: null,
    relicOffers: [],
    // replaced by genLair
    hoard: { x0: 0, y0: 0, x1: 0, y1: 0, pool: 0, pool0: 1 },
    dragon: { x: 0, y: 0, px: 0, py: 0, hp: 1, max: 1, awake: false, cd: 0, scd: 0, stir: 0, stunT: 0 },
    t: 0,
    ticks: 0,
    loot: 0,
    wake: 0,
    over: false,
    guardsSlain: 0,
    slain: false,
    crewLost: 0,
    stage: 0,
    smokeT: 0,
    runDmg: 0,
    relics: {},
    items: { smoke: meta.items.smoke, lull: meta.items.lull, trap: meta.items.trap },
    itemsUsed: { smoke: 0, lull: 0, trap: 0 },
    cmd: null,
    cmdOnly: null,
    cmdT: 0,
    creep: false,
    wakeCall: opts.wakeCall ?? 'RUN.',
    everSpotted: false,
    sealed: false,
    deepTold: false,
    gidNext: 1,
    fx: [],
    tele: [],
    banner: null,
    timers: [],
    shake: 0,
    heartT: 0,
    meta,
    freshPrisonerTid: null,
    rescue: null,
    crewOps: [],
    events: [],
    siphonAcc: 0,
    out: { feed: [], sounds: [], toasts: [], squadDirty: false },
    result: null,
  };

  genLair(s);

  meta.crew.forEach((th, i) => {
    const d = UD[th.kind];
    const lv = lvlOf(th);
    const hp = d.hp * (1 + TUNING.UP_HP_PER_LEVEL * meta.up.hp) * (1 + TUNING.XP_STAT_PER_LEVEL * lv);
    s.units.push({
      tid: th.tid,
      name: th.name,
      k: th.kind,
      lv,
      x: (SPAWN.x0 + (i % SPAWN.cols)) * T + T / 2,
      y: (SPAWN.y0 + ((i / SPAWN.cols) | 0)) * T + T / 2,
      px: (SPAWN.x0 + (i % SPAWN.cols)) * T + T / 2,
      py: (SPAWN.y0 + ((i / SPAWN.cols) | 0)) * T + T / 2,
      hp,
      max: hp,
      cd: 0,
      path: null,
      pi: 0,
      ptile: -1,
      face: 1,
      slam: 0,
      steer: false,
      tgt: null,
      ord: null,
      id: s.rngSim.range(0, 99),
    });
  });

  feed(s, `Depth ${depth} · ${mod.n}`, 'w');
  s.banner = {
    t1: `DEPTH ${depth}`,
    t2: `${mod.n} — ${mod.d}`,
    l: TUNING.BANNER_DEPTH,
    l0: TUNING.BANNER_DEPTH,
  };
  s.out.squadDirty = true;
  snd(s, 60, 0.4, 'sawtooth', 0.07, 40);

  return s;
}

/**
 * Advance the simulation one fixed tick. Commands in the frame are applied
 * first, then the world moves by exactly `SIM_DT`.
 */
export function step(s: RunState, input: InputFrame = IDLE_INPUT): void {
  if (s.over) return;

  // the run clock leads the tick, so `s.t` always reads as "time simulated so
  // far" — whether the run ends inside `update` or on a command
  s.ticks++;
  s.t += SIM_DT;

  if (input.commands) {
    for (const c of input.commands) applyCommand(s, c);
    if (s.over) return;
  }

  // previous-tick positions, for render interpolation only
  for (const u of s.units) {
    u.px = u.x;
    u.py = u.y;
  }
  for (const g of s.guards) {
    g.px = g.x;
    g.py = g.y;
  }
  s.dragon.px = s.dragon.x;
  s.dragon.py = s.dragon.y;

  update(s, SIM_DT, input);
}

/** The prototype's `HB.snapshot()` — the determinism fingerprint of a lair. */
export function snapshot(s: RunState): RunSnapshot {
  return {
    mod: s.mod.id,
    g: s.guards.map((g) => [g.k, g.x | 0, g.y | 0]),
    p: s.piles.map((p) => [p.x | 0, p.y | 0, p.amt]),
    c: s.chests.map((c) => [c.x | 0, c.y | 0, c.amt]),
  };
}

export function snapshotJSON(s: RunState): string {
  return JSON.stringify(snapshot(s));
}

/** Compass target: the hoard until it is nearly drained, then the exit. */
export function compassTarget(s: RunState): { x: number; y: number; exit: boolean } {
  const hh = s.hoard;
  const exit = s.dragon.awake || hh.pool < hh.pool0 * TUNING.LOW_HOARD_FRAC;
  return exit
    ? { x: s.exitCtr.x, y: s.exitCtr.y, exit: true }
    : { x: (hh.x0 + 1.5) * T, y: (hh.y0 + 2) * T, exit: false };
}

/**
 * Headless helper: advance a run by `seconds` of simulated time.
 * Used by the behavioural suite and by the Phase 4 replay worker.
 */
export function advance(
  s: RunState,
  seconds: number,
  input?: InputFrame | ((tick: number) => InputFrame),
): number {
  const n = Math.round(seconds / SIM_DT);
  let done = 0;
  for (let i = 0; i < n && !s.over; i++) {
    const frame = typeof input === 'function' ? input(s.ticks) : input;
    step(s, frame);
    done++;
  }
  return done;
}
