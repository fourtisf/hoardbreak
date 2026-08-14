/**
 * Where to find the game outside the game.
 *
 * The two handles were written out at three call sites each, which is how a
 * rename ends up half-done. They live here instead, next to the one piece of
 * drawing they need: X has a real unicode glyph (𝕏) and Telegram does not, so
 * the paper plane is an inline SVG rather than an emoji — an emoji would render
 * as a different picture on every platform, at a size the line cannot control,
 * in colours that are not the game's.
 */

export const X_URL = 'https://x.com/TheDragonjob';
export const X_HANDLE = '@TheDragonjob';
export const TG_URL = 'https://t.me/thedragonjob';
export const TG_HANDLE = '@thedragonjob';

/** The plane, at text size, inheriting the colour of the line it sits on. */
function TgMark(): JSX.Element {
  return (
    <svg
      className="tgMark"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M21.7 3.3 2.9 10.6c-.9.35-.88 1.63.03 1.95l4.63 1.62 1.79 5.4c.24.72 1.16.9 1.65.33l2.6-3 4.8 3.53c.6.44 1.46.11 1.62-.62l3.2-14.9c.17-.79-.63-1.44-1.52-1.1zM8.9 13.5 18.4 7l-7.9 7.24-.35 3.2-1.25-3.94z" />
    </svg>
  );
}

/** Both handles, as one row. Used wherever the game points at itself. */
export function SocialLinks({
  className = 'ul xlink',
  sep,
}: {
  /** classes for each anchor — the footers want `ul`, the gate does not */
  className?: string;
  /** what goes between them; omit inside a `.footRow`, which spaces its own children */
  sep?: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <a className={className} href={X_URL} target="_blank" rel="noopener noreferrer">
        𝕏 {X_HANDLE}
      </a>
      {sep}
      <a className={className} href={TG_URL} target="_blank" rel="noopener noreferrer">
        <TgMark /> {TG_HANDLE}
      </a>
    </>
  );
}

/** One Telegram link, for lines that name it in prose. */
export function TgLink({ className = 'xlink' }: { className?: string }): JSX.Element {
  return (
    <a className={className} href={TG_URL} target="_blank" rel="noopener noreferrer">
      <TgMark /> {TG_HANDLE}
    </a>
  );
}

/** One X link, same. */
export function XLink({ className = 'xlink' }: { className?: string }): JSX.Element {
  return (
    <a className={className} href={X_URL} target="_blank" rel="noopener noreferrer">
      𝕏 {X_HANDLE}
    </a>
  );
}
