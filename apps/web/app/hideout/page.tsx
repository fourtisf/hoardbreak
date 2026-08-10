'use client';

import dynamic from 'next/dynamic';

/**
 * The hideout reads the in-memory meta store, so it must not be server
 * rendered — Phase 2 turns this into a server component fed by `GET /me`.
 */
const Hideout = dynamic(() => import('@/components/Hideout'), { ssr: false });

export default function Page() {
  return <Hideout />;
}
