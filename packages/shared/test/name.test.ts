/**
 * A name goes next to other people's names.
 *
 * That makes it board furniture, not free text: it has to survive being printed
 * in a fixed-width row beside four other players without wrapping, breaking the
 * line, or shoving anyone off the edge. The rules live in one place so the gate
 * that collects it and any future API that accepts it agree.
 */
import { describe, expect, it } from 'vitest';
import { boardRows } from '../src/board.js';
import { createMeta } from '../src/meta.js';
import { NAME_MAX, cleanName, exportSave, importSave } from '../src/savecode.js';

describe('names', () => {
  it('collapses runs of whitespace and trims the ends', () => {
    expect(cleanName('  Rats   the   Quick  ')).toBe('Rats the Quick');
  });

  it('turns a control character into a space instead of deleting it', () => {
    // a pasted two-line name must not silently become one jammed-together word
    expect(cleanName('Sable\nGrim')).toBe('Sable Grim');
    expect(cleanName('Fen\u0007Bold')).toBe('Fen Bold');
    expect(cleanName('Rats\u007f')).toBe('Rats');
  });

  it('caps the length rather than letting one player crowd out the rest', () => {
    expect(cleanName('x'.repeat(80))).toHaveLength(NAME_MAX);
  });

  it('reduces a name that is only whitespace to nothing, so the gate can refuse it', () => {
    expect(cleanName('   \n  ')).toBe('');
  });

  it('keeps letters outside ASCII — plenty of players do not write in English', () => {
    expect(cleanName('  Ayu  ')).toBe('Ayu');
    expect(cleanName('naga日本')).toBe('naga日本');
  });
});

describe('the board', () => {
  it('puts the player on it under their own name', () => {
    const rows = boardRows('2026-08-11', 1, 9_999_999, 'Alfa');
    expect(rows[0]?.n).toBe('Alfa');
    expect(rows[0]?.you).toBe(true);
  });

  it('falls back to "you" for a hideout that has not been named yet', () => {
    expect(boardRows('2026-08-11', 1, 9_999_999)[0]?.n).toBe('you');
  });

  it('does not mistake a whitespace name for a real one', () => {
    expect(boardRows('2026-08-11', 1, 9_999_999, '   ')[0]?.n).toBe('you');
  });
});

describe('the name travels with the hideout', () => {
  it('survives a save code, so restoring elsewhere does not make you a stranger', () => {
    const m = createMeta('2026-08-11');
    m.name = 'Alfa';
    const r = importSave(exportSave(m));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.name).toBe('Alfa');
  });

  it('defaults to empty for a code written before names existed', () => {
    const r = importSave(exportSave({ ...createMeta('2026-08-11'), name: undefined as unknown as string }));
    expect(r.ok && (r.meta.name ?? '')).toBe('');
  });
});
