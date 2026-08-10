'use client';

import dynamic from 'next/dynamic';

const Raid = dynamic(() => import('@/components/Raid'), { ssr: false });

export default function Page() {
  return <Raid />;
}
