import { DT } from './constants.ts';
import { dequantize } from './input.ts';

// Estimates how far the phone has moved up or down, from acceleration alone.
// Integrating acceleration twice gives displacement, but pure integration drifts: tiny
// sensor errors add up to meters within seconds. A leaky integrator lets each estimate
// decay back toward zero over `leakTime`, so quick swings come through and slow drift
// (or a phone held still) fades to neutral. Only + - * / here, so it replays exactly.
// (Sideways uses tilt instead, which is absolute and needs no integration.)

const STILL_ACCEL = 0.4; // m/s²; quieter than this counts as still (above hand tremor)
const STILL_TIME = 0.08; // s of quiet before the phone counts as stopped

export type PhoneMotion = {
  vy: number; // estimated phone velocity, m/s (up = +)
  dy: number; // estimated phone displacement from neutral, m
  quietTime: number; // s the acceleration has stayed below STILL_ACCEL
};

export function createPhoneMotion(): PhoneMotion {
  return { vy: 0, dy: 0, quietTime: 0 };
}

/** Whether the phone has stopped moving (acceleration quiet for a moment). */
export function phoneStill(m: PhoneMotion): boolean {
  return m.quietTime >= STILL_TIME;
}

/**
 * Advances the estimate one step from a quantized vertical acceleration input.
 * While moving: a plain leaky integrator over `leakTime`. Once the phone is still, the
 * leftover velocity is dropped (it's what made the climber swing back past neutral) and
 * position returns to neutral over the shorter `settleTime`.
 */
export function updatePhoneMotion(
  m: PhoneMotion,
  inputY: number,
  leakTime: number,
  settleTime: number,
): void {
  const a = dequantize(inputY);
  m.quietTime = a < STILL_ACCEL && a > -STILL_ACCEL ? m.quietTime + DT : 0;

  // 1 - DT/τ approximates e^(-DT/τ) without Math.exp (not identical across JS engines).
  if (phoneStill(m)) {
    m.vy = 0;
    m.dy *= 1 - DT / settleTime;
  } else {
    const leak = 1 - DT / leakTime;
    m.vy = m.vy * leak + a * DT;
    m.dy = m.dy * leak + m.vy * DT;
  }
}
