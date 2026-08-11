'use client';

import { useRouter } from 'next/navigation';
import LairCanvas from './LairCanvas';

/** The landing page, ported from the prototype — copy included. */
export default function Landing() {
  const router = useRouter();

  return (
    <div id="landing">
      <LairCanvas />
      <span className="mark markL" aria-hidden="true" />
      <h1>THE DRAGON JOB</h1>
      <div className="tag">
        Rob the dragon. <b>Don&apos;t wake it.</b>
      </div>
      <div className="lsub">
        Lead a named crew of thieves into a sleeping wyrm&apos;s lair. Every day, one lair — same for every player
        on earth. Explore, crack the vaults, siphon the hoard, rescue your fallen… and get out before it wakes.
      </div>
      <button id="btnStart" className="btn gold big" onClick={() => router.push('/hideout')}>
        🜲 GATHER THE CREW
      </button>
      <div className="footRow">
        <a className="ul xlink" href="https://x.com/TheDragonjob" target="_blank" rel="noopener noreferrer">
          𝕏 @TheDragonjob
        </a>
        <span className="ul">·</span>
        <span className="ul">a new lair every day at 00:00 UTC</span>
      </div>
    </div>
  );
}
