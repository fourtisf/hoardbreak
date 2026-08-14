# THE DRAGON JOB — brand marks

One drawing, three finishes. A wyrm coiled around its own hoard, with the coil
left open on the right — that gap is the way in, which is the only reason a crew
has a chance.

| File | Size | Use |
| --- | --- | --- |
| `dragonjob-seal.svg` | vector | Master. Gold wyrm, lair-dark ground, double struck ring. |
| `dragonjob-seal-400.png` | 400×400 | Profile photo upload. |
| `dragonjob-signet.svg` / `-400.png` | vector / 400² | Dark wyrm struck into a gold blank. Best at the smallest sizes. |
| `dragonjob-eclipse.svg` / `-400.png` | vector / 400² | Green wyrm around a solid gold disc. Best large. |
| `dragonjob-x-header-{seal,signet,eclipse}-1500x500.png` | 1500×500 | Social header, one per finish. Use the one matching the avatar. |
| `v04/v04-{1-heart,2-twelve,3-vault,4-crew}-1600x900.png` | 1600×900 | The v0.4 post cards, one per beat. |
| `v04/v04-header-1500x500.png` | 1500×500 | The v0.4 profile header. |
| `v04/plates/z-*.png` | — | The art plates the suite is cut from. |

All three are already cropped to a circle, so the square PNG and a circular crop
show the same thing — nothing important sits in the corners. Content radius is
28.6 of the 32-unit viewBox, leaving ~10% rim clearance.

## The header

The background is a **real lair** — `tools/lair-d6.json` is the grid the engine
generates for 2026-08-11 at depth 6, drawn by the same tile pass the game's
renderer runs (`packages/engine/src/render.ts`): the same hash, the same rock and
floor colours, the same moss specks and edge trim. The warm pools are the actual
gold piles and the chest, glowing through the dark.

The lockup is centred rather than left-aligned, and kept inside the middle
~870 px, for two reasons a social profile imposes:

- the profile photo is overlaid on the header's **lower left**, so anything
  placed there gets covered;
- narrow screens crop the header's **left and right edges**, so the sides can't
  carry anything that matters.

To swap the lair, regenerate the JSON from the engine (`createRun` with
`dailySeed(date, depth)`) and dump `grid`, `piles` and `chests` — the shape the
builder reads is `{cols, rows, grid, piles:[{x,y}], chests:[{x,y}]}`.

## The v0.4 suite

`tools/capture-v04-plates.mjs` makes the art, `tools/build-v04-suite.mjs`
composes it. Both need a dev server, because they drive the real game through
`HB`, the development-only debug handle.

The images are the game's own canvas, and getting them to look like key art
rather than like screenshots took three rules that are easy to get wrong:

- **Zoom the camera, not the image.** The renderer draws the world at the camera
  scale and the labels at a fixed CSS size, so blowing a capture up magnifies
  both — at 4× the wyrm looked magnificent and `THE ROOF IS COMING DOWN` became a
  60 px wall of noise. `viewFor()` takes `k = max(cw/768, ch/528, cw/456)`, so a
  deliberately **tall, narrow viewport** drives `k` far past what a wide window
  gives: tiles land near 40 px while the labels stay at 8–12 px.
- **Strip the HUD at the source.** Names come from `unit.name`, so the capture
  blanks them; the stick, hint bar and toast are hidden with a style tag; the
  guards are removed and the crew made unkillable so no damage numbers print and
  nobody dies while the camera is still setting up. What cannot be removed —
  the wyrm's health bar, which is always drawn above an awake dragon — is hidden
  under the card's top gradient instead.
- **Pose on the last tick before the shutter.** Setting positions in the setup
  step let the sim run for seconds afterwards, which was long enough for the
  seize order to walk the whole crew onto the wyrm's back.

The plates come out at exactly 16:9, and that is what holds the layouts
together: `background-size: cover` lays a plate onto a 1600×900 card one-to-one,
so the wyrm lands top-right and the crew bottom-centre *by construction*, with
the quiet left third free for type. No hand-nudged offsets, nothing to re-tune
when a plate is recaptured.

Treatment: warm bloom over the gold, a raking light shaft, drifting dust, a hard
vignette, and real film grain from an SVG turbulence — all generated. Titles are
gold foil, a gradient clipped to the glyphs over a letterpress shadow. Plates are
scaled with `image-rendering: pixelated`; a bilinear upscale turns crisp 24 px
tiles to mush, and mush is the fastest way to make a game look cheap.

Fonts: the banner sets the wordmark in **Pirata One** — the game's own display
face — and body italics in **Gelasio**, which is metric-compatible with the
Georgia the UI uses. Both must be installed locally; a headless browser will
silently fall back to a generic serif otherwise, and the result looks like a
different product. Verify with a measured width, not by eye.

## Editing

`tools/mark.html` is the generator and the source of truth for the geometry.
Open it in a browser and it draws all three from a handful of parameters:

- `A0` / `A1` — where the coil's head and tail ends sit, in degrees. The arc runs
  the long way round from `A0` down to `A1`; the span between them is the gap.
- `SW` — body thickness at the shoulder. `halfW(t)` tapers it into the tail.
- `angs` — the eight dorsal spines, scaled by a sine so they taper at both ends.
- The head is built in a local frame: `u` along the snout, `n` below the jaw, so
  every head point is `(along, below)` and the whole head rotates as one.

The group transform (`translate/scale/translate`) recentres the mark on its own
bounding box, not on the arc — the head and tail reach much further than the coil
does, so centring on the arc pushes the drawing off the disc.

To re-export after an edit, from the repo root:

```
node tools/export-marks.mjs     # SVGs + 400×400 avatars
node tools/export-banner.mjs    # the three 1500×500 headers
```

Both need playwright; set `CHROME_PATH` to point at a browser binary if the
default download isn't there. `export-marks.mjs` rewrites the SVGs and avatars
and namespaces the gradient ids per mark, so two of them can be inlined on the
same page without colliding — run it **before** `export-banner.mjs`, which reads
those SVGs back in.
