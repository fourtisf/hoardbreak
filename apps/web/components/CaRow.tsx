'use client';

import { useCallback, useState } from 'react';
import { CA, HAS_CA, short } from '@/lib/token';

/**
 * The contract address, or an honest note that there isn't one yet.
 *
 * While `CA` is empty the row is deliberately **not** copyable. Handing someone
 * a clipboard containing the word "soon" when they went looking for an address
 * is how people end up pasting nonsense into a wallet, and a button that does
 * nothing useful is worse than no button.
 *
 * ## Why the address is written out twice
 *
 * Full and truncated forms both sit in the DOM, and CSS picks one by width.
 * The full string is what somebody checks a post against — the whole point of
 * publishing an address is that it can be compared character by character, and
 * `HC6vSv…pump` cannot be compared, only recognised. But 44 monospace
 * characters plus a tag plus a button do not fit on a 360px phone, so below
 * that the short form stands in and the copy button carries the real value.
 *
 * Doing this in CSS rather than in JS is not a style preference. A width read
 * during render disagrees with the server's guess and React tears the row down
 * and rebuilds it on hydration; on the one element where a stale or flickering
 * value is genuinely dangerous, the markup should be settled before it paints.
 * The short copy is `aria-hidden` so a screen reader gets the address once, in
 * full, whichever one is on screen.
 */
export default function CaRow(): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (): Promise<void> => {
    if (!HAS_CA) return;
    try {
      await navigator.clipboard.writeText(CA);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* blocked clipboard — the address is on screen, and `user-select:all`
         means one click selects the whole of it rather than a word of it */
    }
  }, []);

  if (!HAS_CA) {
    return (
      <div className="caRow" aria-label="Contract address: coming soon">
        <span className="caTag">CA</span>
        <span className="caSoon">COMING SOON</span>
      </div>
    );
  }

  return (
    <div className="caRow">
      <span className="caTag">CA</span>
      <code className="caVal" title={CA}>
        <span className="caFull">{CA}</span>
        <span className="caShort" aria-hidden="true">
          {short(CA)}
        </span>
      </code>
      <button className="caCopy" type="button" onClick={copy} aria-label={`Copy contract address ${CA}`}>
        {copied ? '✓ COPIED' : 'COPY'}
      </button>
    </div>
  );
}
