'use client';

import { useCallback, useState } from 'react';

/**
 * The contract address, or an honest note that there isn't one yet.
 *
 * Built as the real thing with a placeholder state rather than as a placeholder:
 * set `NEXT_PUBLIC_CA` and rebuild, and this becomes a live copyable address
 * with no other change.
 *
 * While it is empty the row is deliberately **not** copyable. Handing someone a
 * clipboard containing the word "soon" when they went looking for an address is
 * how people end up pasting nonsense into a wallet, and a button that does
 * nothing useful is worse than no button.
 */
const CA = process.env.NEXT_PUBLIC_CA ?? '';

/** `7xKq…3nWv` — enough to eyeball against, never enough to retype by hand. */
const short = (a: string): string => (a.length <= 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`);

export default function CaRow(): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (): Promise<void> => {
    if (!CA) return;
    try {
      await navigator.clipboard.writeText(CA);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* blocked clipboard — the address is on screen and selectable anyway */
    }
  }, []);

  if (!CA) {
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
      {/* the full address is in the DOM so it can be selected by hand, or read
          by a screen reader, even when the clipboard is unavailable */}
      <code className="caVal" title={CA}>
        {short(CA)}
      </code>
      <button className="caCopy" type="button" onClick={copy} aria-label={`Copy contract address ${CA}`}>
        {copied ? '✓ COPIED' : 'COPY'}
      </button>
    </div>
  );
}
