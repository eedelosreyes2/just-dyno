// The sim only ever sees small integers, rounded once per step, so a recorded run can be
// replayed bit-for-bit on the server. Floats from the sensor never enter the sim directly.

/** Integer input units per m/s². 100 → a resolution of 0.01 m/s². */
export const INPUT_SCALE = 100;

/** Inputs are clamped to ±20 m/s² (about 2 g), well beyond any deliberate pump. */
const INPUT_LIMIT = 20 * INPUT_SCALE;

/** Phone acceleration (m/s²) → recorded integer input. */
export function quantize(accel: number): number {
  const q = Math.round(accel * INPUT_SCALE);
  return Math.max(-INPUT_LIMIT, Math.min(INPUT_LIMIT, q));
}

/** Recorded integer input → acceleration (m/s²) inside the sim. */
export function dequantize(q: number): number {
  return q / INPUT_SCALE;
}
