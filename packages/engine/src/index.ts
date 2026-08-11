/**
 * @dragonjob/engine — the framework-free THE DRAGON JOB game engine.
 *
 * Ported from `HOARDBREAK_v0.2.html` per the production handoff. This entry
 * point is the browser one: it adds the canvas renderer, input and audio to the
 * headless simulation. Node consumers should import
 * `@dragonjob/engine/headless` instead.
 */

export * from './headless.js';

export { createLoop, type Loop, type LoopOptions } from './loop.js';
export { SPRITES, drawSprite, assertSprites, type Sprite, type SpriteTarget } from './sprites.js';
export { createRenderer, type Renderer } from './render.js';
export { createInput, type InputController, type InputOptions } from './input.js';
export { createAudio, type Audio } from './audio.js';
