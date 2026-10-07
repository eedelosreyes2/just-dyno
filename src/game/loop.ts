import { DT } from '../../sim';

// After a stall (app backgrounded, debugger pause), don't try to catch up more than this.
// Without a cap, a long frame queues hundreds of steps, which makes the next frame slow,
// which queues more steps: the "spiral of death".
const MAX_FRAME_S = 0.25;

export type LoopHooks = {
  /** Called once per frame; the same input is held for every step in that frame. */
  readInput: () => { x: number; y: number };
  /** Advances the sim by exactly one DT. */
  step: (inputX: number, inputY: number) => void;
  /** Called once per frame after stepping, to push state to the renderer. */
  render: () => void;
};

/**
 * Fixed-timestep loop: frame time goes into an accumulator, and the sim advances in
 * whole DT steps, so physics is identical at 60 Hz, 120 Hz or on a server.
 * Returns a stop function.
 */
export function startLoop(hooks: LoopHooks): () => void {
  let last: number | null = null;
  let accumulator = 0;
  let frame = 0;

  const tick = (now: number) => {
    if (last !== null) accumulator += Math.min((now - last) / 1000, MAX_FRAME_S);
    last = now;

    const input = hooks.readInput();
    while (accumulator >= DT) {
      hooks.step(input.x, input.y);
      accumulator -= DT;
    }
    hooks.render();
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
