'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Invitation gate.
 *
 * This is a doorman, NOT security. The code ships in the client bundle, so
 * anyone who opens devtools can read it and anyone who sets one localStorage
 * key walks straight past. It exists to keep a closed beta closed, and it is
 * worth exactly that much. Anything that actually needs protecting has to be
 * checked on the server.
 */
const KEY = 'dragonjob.access';
const CODE = process.env.NEXT_PUBLIC_ACCESS_CODE ?? '1998';

export default function Gate({ children }: { children: React.ReactNode }): JSX.Element | null {
  // null = we have not read localStorage yet; rendering the gate before we
  // know would flash a locked door at people who are already through it
  const [open, setOpen] = useState<boolean | null>(null);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(KEY) === CODE);
    } catch {
      setOpen(false); // private mode with storage blocked — ask every time
    }
  }, []);

  useEffect(() => {
    if (open === false) input.current?.focus();
  }, [open]);

  if (open === null) return null;
  if (open) return <>{children}</>;

  const knock = (e: React.FormEvent): void => {
    e.preventDefault();
    if (value.trim() !== CODE) {
      setWrong(true);
      setValue('');
      input.current?.focus();
      return;
    }
    try {
      window.localStorage.setItem(KEY, CODE);
    } catch {
      /* storage blocked — let them in for this session anyway */
    }
    setOpen(true);
  };

  return (
    <div id="gate">
      <h1>The Door Is Shut</h1>
      <p>
        This job is invitation only. If someone sent you, they gave you the word.
      </p>
      <form onSubmit={knock}>
        <label className="sig" htmlFor="gateCode">
          THE WORD
        </label>
        <input
          id="gateCode"
          ref={input}
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
          {wrong ? 'Not the word. The door stays shut.' : ''}
        </div>
        <button className="btn" type="submit">
          KNOCK
        </button>
      </form>
      <span className="sig">THEDRAGONJOB.COM</span>
    </div>
  );
}
