'use client';

import dynamic from 'next/dynamic';

// the landing canvas is client-only; there is nothing worth server-rendering
const Landing = dynamic(() => import('@/components/Landing'), { ssr: false });

export default function Page() {
  return <Landing />;
}
