/**
 * @dragonjob/shared — meta state, economy rules and API contracts.
 *
 * Depends on `@dragonjob/engine` for game data (crew stats, item prices, the
 * PRNG) so there is exactly one definition of every number in the product.
 */

export * from './meta.js';
export * from './board.js';
export * from './schemas.js';
export * from './verdict.js';
export * from './slayer.js';
export * from './share.js';
export * from './savecode.js';
