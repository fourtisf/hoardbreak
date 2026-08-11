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
| `dragonjob-x-header-1500x500.png` | 1500×500 | Social header. Lockup is centred so an overlaid profile photo misses it. |

All three are already cropped to a circle, so the square PNG and a circular crop
show the same thing — nothing important sits in the corners. Content radius is
28.6 of the 32-unit viewBox, leaving ~10% rim clearance.

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
node tools/export-marks.mjs            # needs playwright; CHROME_PATH= to point at a browser
```

It rewrites every file in this folder and namespaces the gradient ids per mark,
so two of them can be inlined on the same page without colliding.
