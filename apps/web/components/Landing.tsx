'use client';

import { useRouter } from 'next/navigation';
import LairCanvas from './LairCanvas';
import CaRow from './CaRow';
import { SocialLinks } from './Social';

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
        <SocialLinks sep={<span className="ul">·</span>} />
        <span className="ul">·</span>
        <span className="ul">a new lair every day at 00:00 UTC</span>
      </div>
      {/* The address belongs on the page anyone can reach without a code. This
          is the site a post points at, so it has to be the place someone can
          check an address against — otherwise the only copy they can find is
          whichever one a reply guy pasted at them. */}
      <CaRow />
    </div>
  );
}
