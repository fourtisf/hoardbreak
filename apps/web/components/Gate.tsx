'use client';

import { useEffect, useRef, useState } from 'react';
import { NAME_MAX, cleanName } from '@dragonjob/shared';
import { getMeta, mutate } from '@/lib/store';
import LairCanvas from './LairCanvas';
import CaRow from './CaRow';
import { TgLink, XLink } from './Social';

/**
 * Invitation gate.
 *
 * This is a doorman, NOT security. The code ships in the client bundle, so
 * anyone who opens devtools can read it and walks straight past. It exists to
 * keep a closed beta closed, and it is worth exactly that much. Anything that
 * actually needs protecting has to be checked on the server.
 *
 * The code is asked for on **every page load**, on purpose. It used to be
 * remembered in localStorage, which meant a player saw the door exactly once
 * and never again — including on a reload — so the door was invisible to the
 * only people who had already been let in. Being asked again is the point of a
 * closed beta. Walking between pages inside the app does not re-ask: this sits
 * in the root layout, so only a real reload remounts it.
 *
 * The name is different, and stays remembered: it is who you are on the board,
 * not a key to the door. Someone who has already given one is only asked for
 * the code.
 */
/** the old "you are through" key, from when this was remembered — cleared on sight */
const STALE_KEY = 'dragonjob.access';
const CODE = process.env.NEXT_PUBLIC_ACCESS_CODE ?? '1998';

export default function Gate({ children }: { children: React.ReactNode }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  // whether we have read the save yet. It decides if the name field belongs on
  // the form, and a field that appears a tick late can tell someone off for
  // leaving blank a box that was not on screen when they hit ENTER.
  const [ready, setReady] = useState(false);
  const [needName, setNeedName] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // the name survives; the code never does
    setNeedName(getMeta().name.trim().length === 0);
    try {
      window.localStorage.removeItem(STALE_KEY);
    } catch {
      /* nothing to clear if storage is blocked */
    }
    setReady(true);
  }, []);

  // `needName` is resolved after mount, and it decides which field `first`
  // points at — without it in the deps, a first-ever visitor gets the caret in
  // INVITE CODE while an empty name box sits above it
  useEffect(() => {
    if (ready && !open) first.current?.focus();
  }, [open, needName, ready]);

  if (open) return <>{children}</>;
  if (!ready) return null;

  const knock = (e: React.FormEvent): void => {
    e.preventDefault();
    const who = cleanName(name);
    if (needName && !who) {
      setWrong(true);
      first.current?.focus();
      return;
    }
    if (value.trim() !== CODE) {
      setWrong(true);
      setValue('');
      return;
    }
    if (who) mutate((m) => (m.name = who));
    setOpen(true);
  };

  const err = !wrong
    ? ''
    : needName && !cleanName(name)
      ? 'Enter a name first — the board has to call you something.'
      : 'Wrong invite code. Check it and try again.';

  return (
    <div id="gate">
      <LairCanvas id="gcv" />
      <h1>The Door Is Shut</h1>
      <p>This job is invitation only. Enter your invite code to get in.</p>
      <form onSubmit={knock}>
        {needName && (
          <>
            <label className="sig" htmlFor="gateName">
              YOUR NAME
            </label>
            <input
              id="gateName"
              ref={first}
              className="gateName"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={NAME_MAX}
              placeholder="shown on the board"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setWrong(false);
              }}
            />
          </>
        )}
        <label className="sig" htmlFor="gateCode">
          INVITE CODE
        </label>
        <input
          id="gateCode"
          ref={needName ? undefined : first}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          aria-invalid={wrong}
          aria-describedby="gateErr"
          placeholder="ask whoever sent you"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
        />
        <div className="err" id="gateErr" role="status">
          {err}
        </div>
        <button className="btn" type="submit">
          ENTER
        </button>
      </form>
      {/* Somebody standing at a locked door with no code needs somewhere to go
          and ask for one, and this is the only screen they can see. It sits
          above the signature line and reads brighter than it, because for a
          visitor without a code this is the only thing on the page that helps. */}
      <div className="gateAsk">
        No code? <XLink /> and <TgLink /> hand them out.
      </div>
      <CaRow />
      <span className="sig">THEDRAGONJOB.COM</span>
    </div>
  );
}
