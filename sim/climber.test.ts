// Run with `npm test`. Plain node:test, no framework: the sim is pure TS, so Node runs it directly.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createClimber,
  createPhoneMotion,
  DEFAULT_PARAMS,
  DT,
  feetPlanted,
  quantize,
  restY,
  step,
  updatePhoneMotion,
  type Body,
} from './index.ts';

const STEPS_PER_S = 120;

/** A smooth vertical phone move of `dist` meters (up = +) over `dur` seconds (smoothstep). */
type Move = { dist: number; dur: number };

/** Phone acceleration at time t for a sequence of moves. Polynomial, so no Math.sin needed. */
function accelAt(moves: Move[], t: number): number {
  let start = 0;
  for (const move of moves) {
    if (t < start + move.dur) {
      const s = (t - start) / move.dur;
      return (move.dist * (6 - 12 * s)) / (move.dur * move.dur);
    }
    start += move.dur;
  }
  return 0;
}

/**
 * Runs the climber through vertical phone moves while holding a constant tilt
 * (gravity along the phone's x axis, m/s²). Returns the body after every step.
 */
function play(moves: Move[], seconds = 2.5, tilt = 0): Body[] {
  const climber = createClimber(DEFAULT_PARAMS);
  const history: Body[] = [];
  for (let i = 0; i < seconds * STEPS_PER_S; i++) {
    const inputY = quantize(accelAt(moves, i * DT));
    step(climber, DEFAULT_PARAMS, quantize(tilt), inputY, true);
    history.push({ ...climber.body });
  }
  return history;
}

const rise = (b: Body) => restY(DEFAULT_PARAMS) - b.y; // screen y is down
const DIP: Move = { dist: -0.1, dur: 0.4 };

test('climber stays at rest with the phone still', () => {
  const last = play([], 5).at(-1)!;
  assert.ok(Math.abs(rise(last)) < 0.001 && Math.abs(last.x) < 0.001);
});

test('phone down → the climber squats', () => {
  const lowest = Math.min(...play([DIP]).map(rise));
  assert.ok(lowest < -0.05, `squatted only ${(-lowest * 100).toFixed(1)} cm`);
});

test('a fast upward swing lifts the feet off; a slow one does not', () => {
  const fast = play([DIP, { dist: 0.2, dur: 0.25 }]);
  const slow = play([DIP, { dist: 0.2, dur: 0.8 }]);
  assert.ok(fast.some((b) => !feetPlanted(b, DEFAULT_PARAMS)), 'fast swing should leave the footholds');
  assert.ok(slow.every((b) => feetPlanted(b, DEFAULT_PARAMS)), 'slow swing should keep the feet planted');
});

test('tilt left → the climber leans left and stays leaning; right → right', () => {
  const g = DEFAULT_PARAMS.gravity;
  const tilt20 = g * 0.342; // gravity × sin(20°)
  const left = play([], 2, -tilt20).at(-1)!;
  const right = play([], 2, tilt20).at(-1)!;
  assert.ok(left.x < -0.1, `left lean only ${(left.x * 100).toFixed(1)} cm`);
  assert.ok(right.x > 0.1, `right lean only ${(right.x * 100).toFixed(1)} cm`);
});

test('the phone-movement estimate fades to neutral when the phone is still', () => {
  const phone = createPhoneMotion();
  // A one-directional 1 s jolt (a worst case for drift), then 2 s of stillness.
  for (let i = 0; i < 3 * STEPS_PER_S; i++) {
    const input = i < STEPS_PER_S ? quantize(0.5) : 0;
    updatePhoneMotion(phone, input, DEFAULT_PARAMS.leakTime, DEFAULT_PARAMS.settleTime);
  }
  assert.ok(Math.abs(phone.dy) < 0.01 && Math.abs(phone.vy) < 0.01, `drifted to ${phone.dy} m`);
});

test('the climber settles after a flick instead of wobbling', () => {
  const history = play([DIP, { dist: 0.2, dur: 0.25 }], 3);
  const settled = history.slice(-STEPS_PER_S); // the last second, well after the flick
  const swing = Math.max(...settled.map((b) => Math.abs(rise(b))));
  assert.ok(swing < 0.01, `still moving ${(swing * 100).toFixed(1)} cm`);
});

test('arms never stretch past arm length while holding', () => {
  const history = play([{ dist: -0.5, dur: 0.3 }]); // violent downward yank
  for (const b of history) {
    assert.ok(Math.sqrt(b.x * b.x + b.y * b.y) <= DEFAULT_PARAMS.arm + 1e-9);
  }
});

test('identical inputs give bit-identical state', () => {
  // A varied but reproducible input sequence, using only sqrt (no Math.random/sin in sim/).
  const inputs = (i: number) => quantize(Math.sqrt(i % 97) - 4.5);
  const a = createClimber(DEFAULT_PARAMS);
  const b = createClimber(DEFAULT_PARAMS);
  for (let i = 0; i < 10 * STEPS_PER_S; i++) {
    step(a, DEFAULT_PARAMS, inputs(i), inputs(i + 13), true);
    step(b, DEFAULT_PARAMS, inputs(i), inputs(i + 13), true);
  }
  assert.deepEqual(a, b);
});

test('quantize rounds to 0.01 m/s² and clamps at ±20 m/s²', () => {
  assert.equal(quantize(1.234), 123);
  assert.equal(quantize(-0.005), -0); // Math.round(-0.5) is -0; fine as an input
  assert.equal(quantize(99), 2000);
  assert.equal(quantize(-99), -2000);
});
