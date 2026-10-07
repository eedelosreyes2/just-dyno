/**
 * The part of the phone's acceleration that points up in the room, in m/s² (up = +),
 * whatever way the phone is held or rotating (e.g. mid pan-flip).
 *
 * `a*`: the phone's actual acceleration in its own axes (gravity removed, platform sign
 * already normalized). `g*`: gravity in the phone's axes, pointing toward the earth.
 * Projects `a` onto the unit vector opposite gravity: up = −(a · ĝ).
 *
 * Runs on the app side before quantizing; it lives in sim/ because it's pure math that
 * obeys the sim rules (only + - * / and sqrt) and can be tested headlessly.
 */
export function worldUpAccel(
  ax: number,
  ay: number,
  az: number,
  gx: number,
  gy: number,
  gz: number,
): number {
  const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (gLen < 1e-6) return 0; // no gravity reading (free fall or sensor glitch): no "up"
  return -(ax * gx + ay * gy + az * gz) / gLen;
}
