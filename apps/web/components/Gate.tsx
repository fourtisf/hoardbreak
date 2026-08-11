'use client';

import { useEffect, useRef, useState } from 'react';
import { NAME_MAX, cleanName } from '@dragonjob/shared';
import { getMeta, mutate } from '@/lib/store';

/**
 * Invitation gate.
 *
 * This is a doorman, NOT security. The code ships in the client bundle, so
 * anyone who opens devtools can read it and anyone who sets one localStorage
 * key walks straight past. It exists to keep a closed beta closed, and it is
 * worth exactly that much. Anything that actually needs protecting has to be
 * checked on the server.
 *
 * It also takes a name, because the board was calling everybody "you" — which
 * is nobody. The name is asked for once, here, at the only moment the player is
 * already stopped and typing.
 */
const KEY = 'dragonjob.access';
const CODE = process.env.NEXT_PUBLIC_ACCESS_CODE ?? '1998';

export default function Gate({ children }: { children: React.ReactNode }): JSX.Element | null {
  // null = we have not read localStorage yet; rendering the gate before we
  // know would flash a locked door at people who are already through it
  const [open, setOpen] = useState<boolean | null>(null);
  const [needName, setNeedName] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let through = false;
    try {
      through = window.localStorage.getItem(KEY) === CODE;
    } catch {
      through = false; // private mode with storage blocked — ask every time
    }
    const named = getMeta().name.trim().length > 0;
    setNeedName(!named);
    // someone who is through the door but has no name yet still gets asked
    setOpen(through && named);
  }, []);

  useEffect(() => {
    if (open === false) first.current?.focus();
  }, [open]);

  if (open === null) return null;
  if (open) return <>{children}</>;

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
    try {
      window.localStorage.setItem(KEY, CODE);
    } catch {
      /* storage blocked — let them in for this session anyway */
    }
    if (who) mutate((m) => (m.name = who));
    setOpen(true);
  };

  const err = !wrong
    ? ''
    : needName && !cleanName(name)
      ? 'Give a name first — the board has to call you something.'
      : 'Not the word. The door stays shut.';

  return (
    <div id="gate">
      <h1>The Door Is Shut</h1>
      <p>This job is invitation only. If someone sent you, they gave you the word.</p>
      <form onSubmit={knock}>
        {needName && (
          <>
            <label className="sig" htmlFor="gateName">
              WHAT THEY CALL YOU
            </label>
            <input
              id="gateName"
              ref={first}
              className="gateName"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={NAME_MAX}
              placeholder="a name for the board"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setWrong(false);
              }}
            />
          </>
        )}
        <label className="sig" htmlFor="gateCode">
          THE WORD
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
          KNOCK
        </button>
      </form>
      <span className="sig">THEDRAGONJOB.COM</span>
    </div>
  );
}
