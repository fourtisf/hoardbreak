/**
 * Headless entry point — everything that runs without a browser.
 *
 * `@quietgold/engine/headless` is what the Fastify API and the Phase 4 replay
 * worker import: same simulation, no canvas, no `window`. The default entry
 * (`@quietgold/engine`) re-exports all of this plus the browser surfaces.
 */

export * from './defs.js';
export * from './types.js';
export * from './rng.js';
export * from './daily.js';
export * from './grid.js';
export * from './util.js';
export { genLair, spawnGuard, maxLootFor } from './gen.js';
export {
  createRun,
  step,
  advance,
  snapshot,
  snapshotJSON,
  drainOutput,
  endRun,
  abandonRun,
  useItem,
  addWake,
  extractReady,
  inZone,
  unitDmgMul,
  compassTarget,
  type CreateRunOptions,
} from './sim.js';
