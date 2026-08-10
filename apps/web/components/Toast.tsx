'use client';

import { useEffect, useRef, useState } from 'react';
import { onToast } from '@/lib/toast';

export default function Toast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = onToast((m) => {
      setMsg(m);
      setShow(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 2400);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div id="toast" className={show ? 'show' : ''}>
      {msg}
    </div>
  );
}
