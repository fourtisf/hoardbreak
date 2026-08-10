# HOARDBREAK — Production Handoff (v0.2 → production)

**For:** Michael (implementation via Claude Code)
**From:** ALFA (product) — prototype built & QA'd in Claude
**Prototype (source of truth):** `HOARDBREAK_v0.2.html` — ship this file alongside this doc in the repo root.

---

## 0 · How to use this handoff with Claude Code

Put both files in an empty repo, then start Claude Code and paste:

```
Read HANDOFF (HOARDBREAK_HANDOFF.md) fully, then open HOARDBREAK_v0.2.html and study the
<script> block — it is the playable, tested reference implementation of the entire game.
Implement Phase 1 exactly as specified in section 12. Do not redesign game feel, constants,
or formulas: port them. Ask me before deviating from the stack pins in section 3.
```

Work phase by phase (section 12). Each phase has acceptance criteria — do not start the next phase until the current one passes.

---

## 1 · What this is

**HOARDBREAK** — a mobile-first extraction-heist roguelite for the Fourtis ecosystem.
Tagline: *"Rob the dragon. Don't wake it. Be the exit liquidity."*

Core loop: Hideout (recruit named thieves, buy items/upgrades) → raid a fog-of-war dragon lair → loot piles/chests, siphon the hoard, hit shrines/armories, rescue imprisoned crew → every noise fills the **WYRM WAKE** meter (staged dragon at 50/75/100%) → reach the EXIT tiles and extract, or lose everything.

**The product hook:** *Daily Heist.* Lairs are generated from a `date:depth` seed — every player on earth raids the same lairs each day, competing on a daily leaderboard (biggest single heist) and earning **$LOOT**.

Prototype status: fully playable, 20/20 automated behavioral checks green (determinism, items, staged dragon, XP, prison rescue, extraction accounting), plus headless organic playthroughs clean. Joystick + WASD + click-move all verified.

## 2 · Source of truth — what to port vs. what to change

**Port verbatim (do not redesign):**
- All game constants, formulas, and timings (section 10 is the extracted reference; the prototype is authoritative if they ever disagree).
- Sprite system: `SPRITES` char-grid data + `drawSprite` renderer. Tiny, crisp, already validated.
- Lair generation algorithm, room-type assignment, fog reveal, squad/guard AI, staged dragon, item effects, compass/EXIT UX, tutorial copy.
- The seeded PRNG pair: `hashStr` + `mulberry32`.

**Change for production (specified below):**
- Seed becomes **server-issued** (HMAC), not client-computed (§5).
- Meta state (gold, crew, items, upgrades, $LOOT) moves **server-side** (§6–7). The prototype's in-memory `M` object becomes API-backed.
- `Math.random` inside the simulation is replaced by a per-run seeded stream (§4) so runs are replay-verifiable later.
- Leaderboard becomes real (Redis + Postgres, §8).

## 3 · Stack pins (ALFA's standard)

- **Monorepo:** pnpm workspaces → `apps/web` (Next.js 14, App Router, TS), `apps/api` (Fastify, TS), `packages/engine` (framework-free game engine, TS), `packages/shared` (zod schemas, constants).
- **DB:** PostgreSQL + Prisma. **Cache/boards:** Redis. **Deploy:** Hostinger VPS, PM2, Nginx (§13).
- **Wallet:** Solana wallet adapter (Phantom/Backpack) for identity; Helius available if on-chain reads are ever needed. *(Chain for $LOOT claims is an open decision — §14.)*
- No game engine frameworks. The prototype's vanilla canvas engine ports to `packages/engine` almost as-is.

## 4 · Engine port (`packages/engine`)

- Extract the prototype `<script>` into modules: `defs.ts` (UD/GD/RELICS/MODS/constants), `rng.ts`, `gen.ts` (genLair), `sim.ts` (update/unitStep/guardStep/dragonStep), `render.ts` (canvas), `input.ts` (joystick/WASD/click).
- **Fixed timestep:** convert the rAF variable-`dt` loop to a fixed 60 Hz accumulator (`SIM_DT = 1/60`), rendering interpolated. This is required for future replay verification.
- **Two RNG streams per run:** `rngGen` (lair layout — must match server) and `rngSim` (combat jitter, fx), both seeded from the server-issued run seed. Replace every `Math.random()`/`rnd()`/`ri()` call inside sim/gen with these. Cosmetic-only randomness (landing particles) may stay on `Math.random`.
- Engine exposes: `createRun(seed, depth, mod, meta) → RunState`, `step(state, inputs)`, `snapshot(state)` (the same JSON shape as the prototype's `HB.snapshot()`), and an event log emitter (§6).
- Keep the prototype's `window.HB` debug handle behind `NODE_ENV !== 'production'`.

## 5 · Daily seed system (server-authoritative)

- Server secret `SEED_SECRET` (env). For date `D` (UTC) and depth `n`:
  `seed = HMAC_SHA256(SEED_SECRET, `${D}:${n}`)` → first 8 bytes → uint.
- Clients can never predict tomorrow's lairs. `GET /daily` returns today's date, per-depth **modifier previews** (server runs `modFor` itself), and board snapshot — but seeds are only issued inside a run ticket (§6).
- The API regenerates any lair on demand from `(date, depth)` to validate results — determinism is the anti-cheat backbone.
- Day rollover: UTC midnight. Board freezes, yesterday's board archived to Postgres, $LOOT emissions settled (§9).

## 6 · API spec (Fastify) + validation tiers

Auth: wallet connect → nonce sign → JWT session cookie. All below require auth unless noted.

- `GET /daily` *(public)* — `{date, depths:[{n, mod}], board:{top:[...], me?}}`
- `GET /me` — profile + meta: gold, $LOOT, depth, crew[] (named, xp), items, upgrades, lost[] (imprisoned).
- `POST /camp/recruit {kind}` · `POST /camp/upgrade {key}` · `POST /camp/item {key}` — server enforces costs/caps from shared constants; returns updated meta. **All meta mutations are server-side.**
- `POST /runs/start {depth}` — validates depth ≤ unlocked; issues `{runId, seed, mod, ticket}` (ticket = signed `{runId, wallet, date, depth, iat}`), snapshots the meta used (crew/items/upgrades) into the Run row, decrements consumables **at start** (they travel into the lair).
- `POST /runs/complete {runId, ticket, result, events}` — result: `{success, loot, stolenPct, guardsSlain, crewLostTids[], rescuedTid?, survivorsTids[], slain, durationMs}`. Events: compact log `[t, code, value]` for LOOT_PILE, CHEST, SIPHON_TICK, GUARD_KILL, SHRINE, ARMORY, RESCUE, ITEM_USE, WAKE_MILESTONE(50/75/100), EXTRACT.

**Validation tiers (anti-cheat v1 — all server-side, in order):**
1. Ticket signature + single use + run age < 20 min.
2. **Seed-bound loot ceiling:** regenerate the lair from `(date, depth)`; compute `maxLoot = Σpiles + Σchests + hoardPool + guardBounties + slayBonus(2000) + shrineOverflow(200)`, apply Greedy Gauntlets ×1.3 only to piles+siphon portions. Reject `loot > maxLoot`.
3. Duration floor: `durationMs ≥ 900 × loot / 60` sanity (can't siphon faster than 60 g/s/thief × crew) and ≥ shortest-path-to-hoard time estimate; reject sub-minimum.
4. Event-sum consistency: Σ(loot events) ≈ result.loot (±2%); wake milestones present in order; ITEM_USE count ≤ items snapshotted at start.
5. Rate limits: ≤ 40 runs/wallet/day; ≤ 1 concurrent open run; board submission = best success only.
6. Heuristics → `flagged` runs excluded from board + $LOOT, wallet shadow-listed after 3 flags.

On success: apply meta changes atomically (gold+, xp+1 to in-zone survivors, crew removals→lost queue, rescued join, depth++), update boards (§8), append LootLedger (§9).

**v2 (later, Phase 4):** full deterministic replay — client submits the input log; a worker re-simulates the fixed-timestep engine server-side (engine is shared TS, so this is `import {simulate} from '@hoardbreak/engine'`) and diffs final state. Design the event/input log format now so v2 needs no client changes.

## 7 · Prisma schema (core)

```prisma
model User { id String @id @default(cuid())  wallet String @unique
  gold Int @default(300)  loot Int @default(0)  depth Int @default(1)  bestDepth Int @default(0)
  upDmg Int @default(0) upHp Int @default(0) upInc Int @default(0)
  itemSmoke Int @default(0) itemLull Int @default(0) itemTrap Int @default(0)
  crew CrewMember[]  runs Run[]  ledger LootLedger[]  flags Int @default(0)
  createdAt DateTime @default(now()) }

model CrewMember { id String @id @default(cuid())  userId String  user User @relation(fields:[userId], references:[id])
  name String  kind String  xp Int @default(0)
  status String @default("active") // active | imprisoned | gone
  @@index([userId, status]) }

model Run { id String @id @default(cuid())  userId String  user User @relation(fields:[userId], references:[id])
  date String  depth Int  seedHex String  mod String
  status String @default("open") // open | success | fail | flagged | expired
  loot Int @default(0)  stolenPct Int @default(0)  guardsSlain Int @default(0)  slainDragon Boolean @default(false)
  durationMs Int @default(0)  metaSnapshot Json  events Json?
  createdAt DateTime @default(now())  completedAt DateTime?
  @@index([date, status])  @@index([userId, date]) }

model DailyBoard { id String @id @default(cuid())  date String  wallet String  best Int
  @@unique([date, wallet])  @@index([date, best]) }

model LootLedger { id String @id @default(cuid())  userId String  user User @relation(fields:[userId], references:[id])
  date String  amount Int  reason String  runId String?
  claimed Boolean @default(false)
  @@index([userId, claimed]) }
```

## 8 · Redis

- `lb:{date}` — ZSET, member=wallet, score=best single-heist loot (ZADD GT). Read: `GET /daily` top 100 + rank-around-me.
- `run:open:{wallet}` — enforce single open run (EX 1200).
- `rl:{wallet}:{date}` — daily run counter.
- Nightly job: persist `lb:{yesterday}` → `DailyBoard`, expire the ZSET after 48 h.

## 9 · $LOOT v1 (off-chain ledger → periodic claim)

- Earn per successful run (mirror prototype): `depth*3 + (stolenPct>=60 ? depth*2 : 0) + (slain?12:0) + floor(guardsSlain/3)`.
- Daily bonus: board top 10 at rollover → `[100,70,50,40,30,25,20,15,10,10]` extra $LOOT.
- Caps: ≤ 120 $LOOT/wallet/day from runs; flagged runs earn 0.
- Balances live in `LootLedger`; UI shows total + claimable. **Claims:** weekly Merkle distribution on-chain (chain TBD — §14); build the ledger + `GET /loot/proof` endpoint now, contract later.
- Never mint from client-reported numbers — only from validated runs.

## 10 · Complete game constants (extracted from v0.2 — authoritative reference)

**Grid:** 32×22 tiles, 24 px. Entrance room (2,15)–(6,19); EXIT = its two left columns. Hoard chamber (24,3)–(29,8); hoard pile tiles (26,4)–(28,7). 4 mid rooms, 4–6 × 3–5, seeded positions; L-corridors 2 wide, chained entrance→rooms→hoard.

**Crew classes** `UD` (hp / dps / speed / range·T / cost):
- Picklock 70/12/96/0.85/60g — chests ×2 speed; death-burst 45 dmg r1.3T
- Hexer 80/15/74/3.4/110g — hex: target takes +30% dmg, 3 s
- Bruiser 320/20/56/0.9/140g — taunt radius 2.4T
- Emberkin 150/27/66/2.9/220g — ignite 9 dps 3 s; takes ×0.5 dragonfire
- Bone Golem 560/25/38/0.95/380g — slam 40 dmg r1.7T, stun 0.8 s, cd 5 s

**Guards** `GD` (hp/dps/spd/range): Cult Guard 85/9/44/0.9 · Sentinel 75/12/48/3.6 · Vault Warden 220/14/36/0.95 · Acolyte 95/5/40/0.9 (heals 9 hp/s, r3T) · High Warden 520/22/32/1.0. Scaling: hp ×(1+0.1·(depth−1))×mod.gHp. Detection radius 4.4T (+mod.alertAdd)(×0.7 Shadow Cloak). Room guards: 1+⌊depth/2⌋+rand(0,1) (+1 in 2 rooms on HEAVY GARRISON); warden guaranteed depth≥3; hoard adds warden + (depth≥2: sentinel / depth≥4: High Warden). Kill bounty 10 g.

**Wake sources** (before multipliers): passive 0.9/s · crew within 6T of dragon +2.2/s · guard alerted +4 · guard killed +6 · chest +8 · siphon +6/s (crew factor capped ×3) · golem slam +4 · shrine +4 · rescue +6. Multipliers: Sleepy Incense 0.8^lvl (max 3) · mod.wakeMul · Muffled Boots ×0.8.

**Dragon:** hp 2600+400·depth. Stage 1 at 50%: eye opens, sleep-breath (55 dmg, r2.2T, 0.6 s telegraph) every 6.5 s near crew. Stage 2 at 75%: 2 alerted reinforcements at hoard edge, breath every 4.2 s, heartbeat SFX + red vignette ≥70%. Awake at 100%: flies (ignores walls) 54 px/s to squad centroid, breath 85 dmg r2.2T cd 3.6 s (telegraph 0.55 s). Dragonfire reductions multiply: Emberkin 0.5 · Ember Ward 0.65. Bear trap on awake dragon: 150 dmg + 2.5 s stun. Slaying: +2000 g, run auto-succeeds.

**Loot:** piles 40–90 g ×mod.pileMul (count 1–3/room ×pileMul) · chests (guardpost rooms, 70%) 120+60·depth+rand(0,60), ×mod.chestMul, crack 1.3 s (Picklock ×2, Lockbreaker instant) · hoard pool 800+420·depth ×mod.hoardMul, siphon 60 g/s per thief on pile tiles · Greedy Gauntlets ×1.3 on piles+siphon.

**Rooms:** pool `[guardpost, guardpost|prison, shrine, armory]` seeded-shuffled; prison replaces slot 2 when lost-queue non-empty or depth≥2 (prisoner = oldest lost crew member, else fresh recruit; rescue channel 1.6 s; guarded by a warden). Shrine: 1.2 s channel → random unowned relic (all owned → +200 g). Armory: touch → +15% crew dmg this run.

**Relics (run-scoped):** Shadow Cloak (detect ×0.7) · Greedy Gauntlets (+30% piles/siphon) · Muffled Boots (wake ×0.8) · Ember Ward (dragonfire ×0.65) · Lockbreaker (instant chests).

**Modifiers (seeded per date:depth):** PITCH DARK reveal 2.4 (base 3.4) · RESTLESS WYRM wake ×1.25, hoard ×1.5 · HEAVY GARRISON +2 guards, hp ×1.2, chests ×1.4 · GILDED HALLS piles ×1.6, detect +1T · A QUIET NIGHT (none).

**Items:** Smoke 80 g (all guards lose alert; 4 s no detection) · Lullaby 120 g (−25 wake, only while asleep) · Bear Trap 100 g (drop at leader; guard: 120 dmg + 1.5 s stun; dragon: 150 dmg + 2.5 s stun). Hotkeys 1/2/3.

**Meta:** start 300 g + crew Rats & Wick (Picklocks), Sable (Hexer), Fen (Bruiser). Crew cap 9; lost-queue cap 6. Upgrades: Sharpened Steel / Padded Leathers +15%/lvl (120 g ×1.7^lvl); Sleepy Incense (100 g ×1.7, max 3). XP: +1 per extraction to in-zone survivors; Lv=min(5,xp); +6% hp & dmg per level. Rescued thieves rejoin permanently only if they survive and extract (crew full → +150 g). Extraction: units outside the zone are left behind → lost queue. Wipe: run loot lost, hideout gold safe. Success: depth+1.

**$LOOT formula:** see §9. Name pool (20): Rats, Wick, Sable, Fen, Moss, Briar, Kestrel, Ash, Vex, Onyx, Pip, Grim, Lark, Sorrel, Nix, Tarn, Vesper, Rook, Silt, Ember.

## 11 · Client (`apps/web`)

- Routes: `/` landing (port prototype landing, add wallet connect + today's board teaser) · `/hideout` (camp: manifest, recruit, black market, daily strip, board) · `/raid` (canvas game) · `/board` (full daily + past days).
- The raid page mounts `packages/engine` in a client component; UI chrome (wake bar, crew list, items, extract) can stay DOM like the prototype.
- Mobile-first: joystick already pointer-based; ensure side panel collapses to a bottom sheet ≤ 480 px; test on low-end Android (the canvas is cheap — keep it that way, no fancy postprocessing).
- Keep ALL prototype copywriting (tutorial, whispers, banners) — it's part of the product voice.

## 12 · Phased delivery + acceptance criteria

**Phase 1 — Faithful port (no backend).** Engine extracted to TS modules, fixed timestep, seeded RNG streams, Next.js shell, local meta in memory. ✅ Accept: plays identically to `HOARDBREAK_v0.2.html`; a scripted headless run (jsdom or node-canvas) reproduces: daily-determinism snapshot equality, smoke/lullaby/trap effects, stage 1/2 thresholds, prison rescue, XP on extract — i.e., re-implement the 20-check suite in the repo (`pnpm test:engine`).

**Phase 2 — Accounts, server seeds, daily board.** Wallet auth, `/daily`, `/runs/start|complete` with validation tiers 1–5, Redis board, meta server-side. ✅ Accept: two browsers same day get identical lairs; forged `loot > maxLoot` rejected; board updates live; meta survives refresh.

**Phase 3 — $LOOT ledger + polish.** Ledger, caps, top-10 rollover bonuses, `/board` history, PWA manifest, OG share card ("My heist: 2,340 g · Depth 4 · RESTLESS WYRM"). ✅ Accept: ledger math matches formulas; share card renders per run.

**Phase 4 — Replay verification + on-chain claims.** Input-log replay worker; Merkle claim contract on chosen chain. ✅ Accept: tampered event logs detected by re-simulation on seeded fixtures.

## 13 · Deployment (Hostinger VPS)

- PM2 apps: `hoardbreak-web` (next start, :3000) · `hoardbreak-api` (:4000) · `hoardbreak-jobs` (rollover cron worker). Nginx: web at `/`, API at `/api/` proxy, gzip on, HTML no-cache / assets immutable.
- Postgres + Redis local to VPS (existing pattern). Env: `DATABASE_URL, REDIS_URL, SEED_SECRET, JWT_SECRET, NODE_ENV`.
- Nightly cron (UTC 00:01): freeze board → DailyBoard, settle top-10 $LOOT, expire Redis keys.

## 14 · Open decisions for ALFA (don't block Phase 1–2)

1. Chain for $LOOT claims (Solana default vs Robinhood Chain) — affects Phase 4 only.
2. Domain + brand lock (`hoardbreak.fun`?), logo pass.
3. Monetization v1: cosmetic name colors? extra daily runs? (Nothing pay-to-win on the daily board.)
4. Depth cap / prestige loop for week-2 retention.
