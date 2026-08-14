/**
 * Headless entry point — everything that runs without a browser.
 *
 * `@dragonjob/engine/headless` is what the Fastify API and the Phase 4 replay
 * worker import: same simulation, no canvas, no `window`. The default entry
 * (`@dragonjob/engine`) re-exports all of this plus the browser surfaces.
 */

export * from './defs.js';
export * from './types.js';
export * from './rng.js';
export * from './daily.js';
export * from './depth.js';
export * from './view.js';
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
  heartPos,
  unitDmgMul,
  compassTarget,
  type CreateRunOptions,
} from './sim.js';
