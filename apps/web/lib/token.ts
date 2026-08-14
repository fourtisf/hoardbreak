/**
 * The $DJOB mint, and the one place it is written down.
 *
 * ## Why this is in the repo and not in an env var
 *
 * `NEXT_PUBLIC_CA` still wins if it is set, but the address below is the
 * default so that a plain `git pull && pnpm build` publishes it. That is not
 * laziness about configuration — it is the safer of the two, for two reasons.
 *
 * A mint address is public and immutable by construction. It is not a secret,
 * so the usual argument for env vars does not apply to it; what does apply is
 * that a wrong address costs somebody their money. Keeping it in version
 * control means every change to it shows up in a diff with an author and a
 * date beside it, which is exactly the review a value like this deserves and
 * exactly what an env var on a box somewhere does not get.
 *
 * The other reason is failure mode. Deploy is a hand-run `git pull && pnpm
 * build` on a VPS. If the address lived only in the environment and the
 * variable were forgotten, nothing would break loudly — the site would simply
 * keep saying COMING SOON, on the day of the launch, while every post pointed
 * at it. Silent is the worst way for this particular thing to be wrong.
 *
 * ## If it ever changes
 *
 * Change it here, rebuild, and check the rendered row against the source of
 * truth character by character before telling anyone. Never retype it — copy
 * it. The test beside this file decodes whatever is here and asserts it is a
 * real 32-byte key, which catches a mangled paste but cannot catch a
 * well-formed address that belongs to somebody else.
 */

/** THE DRAGON JOB — $DJOB, on Solana. */
export const CA = process.env.NEXT_PUBLIC_CA ?? 'HC6vSvrZb1Xrc1NeCSmmBEdSJDbAu42kty1vGmUQpump';

/** Whether there is an address to show at all. Empty means the row says COMING SOON. */
export const HAS_CA = CA.length > 0;

/**
 * `HC6vSv…pump` — enough to eyeball a post against, never enough to retype.
 *
 * Deliberately keeps both ends: the head is what a reader compares first and
 * the tail is what a pump.fun address is recognised by, and a fake that
 * matches both ends is a fake that had to be ground for.
 */
export const short = (a: string): string => (a.length <= 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`);
