/**
 * Sprite data — char grids + palettes, lifted verbatim from the prototype.
 *
 * Each sprite is a palette map plus rows of palette keys ('.' = transparent).
 * Tiny, crisp and already validated; the handoff calls this out explicitly as
 * port-don't-redesign (§2).
 */

export interface Sprite {
  /** palette: char -> css colour */
  p: Record<string, string>;
  /** rows of palette chars, all the same length */
  r: string[];
}

export const SPRITES: Record<string, Sprite> = {
  goblin: {
    p: {"K": "#0a140c", "G": "#3f9a5f", "g": "#2f7a4a", "D": "#1d5232", "Y": "#ffd75e", "S": "#9a9aa6", "B": "#26492f"},
    r: [
      ".KK......KK.",
      "KGGK....KGGK",
      "KGGGKKKKGGGK",
      ".KGGGGGGGGK.",
      ".KGYGGGGYGK.",
      ".KGGGGGGGGK.",
      ".KGgKKKKgGK.",
      "..KGggggGK..",
      "..KBBBBBBKS.",
      ".KBBggggBKSS",
      ".KBBBBBBBKS.",
      "..KgK..KgK..",
      "...K....K...",
    ],
  },
  imp: {
    p: {"K": "#140a0d", "O": "#ff8c50", "o": "#d86a34", "H": "#ffb070", "B": "#8a3a20", "Y": "#ffd75e", "b": "#26262c", "F": "#ffe9a8", "T": "#fff0d8"},
    r: [
      "..KH......HK..",
      "..KHK....KHK..",
      "...KOKKKKOK...",
      "..KOOOOOOOOK..",
      "..KOYOOOOYOK..",
      "..KOOOOOOOOK..",
      "..KOKTKTKTOK..",
      "...KOooooOK...",
      "....KBBBBK.KK.",
      "..KKBBooBBKbbK",
      ".KoKBBBBBBKbbK",
      ".KoK.KBBK..KF.",
      "..K..KoKoK....",
      ".....KK.KK....",
      "..............",
    ],
  },
  shade: {
    p: {"K": "#100a18", "P": "#c9a0f0", "V": "#5a3a7a", "D": "#3a2a52", "d": "#2a1e3e", "E": "#e8d0ff", "W": "#8a6aa0", "S": "#d8c8ec"},
    r: [
      ".....KKKK.....",
      "....KVVVVK....",
      "...KVVVVVVK...",
      "..KVVVVVVVVK..",
      "..KVDDDDDDVK..",
      "..KDEDDDDEDK..",
      "..KDDDDDDDDK..",
      "...KDDDDDDK.W.",
      "..KVVVVVVVVKW.",
      ".KVVDVVVVDVKW.",
      ".KVDDVVVVDDKSW",
      ".KVDDVVVVDDK.W",
      ".KDDDVVVVDDD.W",
      "..KDDVVVVDD.W.",
      "..KDDVVVVDDW..",
      "..KDDDDDDDDK..",
      "...KDDDDDDK...",
      "...KdK..KdK...",
      "....K....K....",
    ],
  },
  orc: {
    p: {"K": "#0d1408", "G": "#8fae4a", "g": "#5f7a2f", "D": "#3d5220", "T": "#f0f6e8", "A": "#4a4a56", "a": "#6a6a7a", "C": "#6a4520", "c": "#3a2510", "Y": "#ffd75e", "R": "#8a3a2a"},
    r: [
      ".....KKKKKK.....KK",
      "....KGGGGGGK...KCK",
      "...KGGGGGGGGK..KCK",
      "...KGYGGGGYGK..KCK",
      "...KGGGGGGGGK.KCCK",
      "...KGgGGGGgGK.KCcK",
      "..KTGGGGGGGGTKKCcK",
      "..KTKGGGGGGKTKGCK.",
      ".KKKKKGGGGKKKKGGK.",
      "KAaAAKKKKKKKAaAAK.",
      "KAAAAKGGGGKKAAAAK.",
      "KAAAKGRGGRGKKAAAK.",
      ".KKKKGGRRGGK.KKK..",
      "....KGGGGGGK......",
      "....KGKKKKGK......",
      "...KDDK..KDDK.....",
      "...KDDK..KDDK.....",
      "....KK....KK......",
    ],
  },
  wyrmling: {
    p: {"K": "#0c1f14", "E": "#5cf08a", "e": "#2a8a58", "d": "#1f4d34", "w": "#2a6a48", "L": "#b8ffd0", "Y": "#ffd75e", "F": "#ff9c3c", "f": "#ffd27a"},
    r: [
      "......KwwK.........",
      ".....KwwwwK........",
      "....KwwwwwwK.......",
      "..KKdewwwedKK......",
      ".KeeedddddeeeKKKK..",
      "KeeeeeeeeeeeeeeYeK.",
      "KdeeeeeeeeeeeeeeKKF",
      ".KdeeLLLLLLeeeKKfF.",
      "..KdeLLLLLLedK..F..",
      "..KdeeeeeeeedK.....",
      ".KdeKdeeedKedK.....",
      ".KdK.KdKdK.KdK.....",
      "..K...K.K...K......",
      "...................",
    ],
  },
  golem: {
    p: {"K": "#141a14", "N": "#e8f2e0", "n": "#c9d6c4", "s": "#8a9a8c", "D": "#3a463c", "G": "#3ddc84", "g": "#1d6b45"},
    r: [
      "....KKKKKKKKK....",
      "...KNNNNNNNNNK...",
      "..KNNNNNNNNNNNK..",
      "..KNKDDKNKDDKNK..",
      "..KNKDGKNKDGKNK..",
      "..KNNNNNNNNNNNK..",
      "..KNKNKNKNKNKNK..",
      "...KKnnnnnnnKK...",
      ".KKNNKKKKKKKNNKK.",
      "KNNNNK.....KNNNNK",
      "KNNsNKnnnnnKNsNNK",
      "KNNNKKnKnKnKKNNNK",
      ".KKKKnnnnnnnKKKK.",
      ".KNNKKnKnKnKKNNK.",
      ".KNNK.nnnnn.KNNK.",
      ".KKKK.KnnnK.KKKK.",
      "......KnnnK......",
      ".....KDDKDDK.....",
      ".....KDDKDDK.....",
      "......KK.KK......",
    ],
  },
};

/** Minimal surface `drawSprite` needs — keeps the data module free of DOM lib. */
export interface SpriteTarget {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Blits a sprite at `sc` pixels per cell, top-left at (ox, oy). */
export function drawSprite(g: SpriteTarget, spr: Sprite, sc: number, ox: number, oy: number): void {
  const pal = spr.p;
  const rows = spr.r;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] as string;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      if (ch === '.') continue;
      g.fillStyle = pal[ch] as string;
      g.fillRect(ox + x * sc, oy + y * sc, sc, sc);
    }
  }
}

/** The prototype's load-time guard: every row of a sprite must be equal width. */
export function assertSprites(): void {
  for (const k of Object.keys(SPRITES)) {
    const r = (SPRITES[k] as Sprite).r;
    const w = (r[0] as string).length;
    for (const row of r) if (row.length !== w) throw new Error('sprite ' + k + ' bad row');
  }
}

assertSprites();
