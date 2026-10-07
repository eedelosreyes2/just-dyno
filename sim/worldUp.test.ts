import assert from 'node:assert/strict';
import { test } from 'node:test';

import { worldUpAccel } from './index.ts';

const G = 9.81;
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

// Phone axes: x right, y toward the top edge, z out of the screen.
// Gravity points toward the earth, as Expo reports it.

test('upright portrait: up is the phone’s +y', () => {
  const g = [0, -G, 0] as const; // earth is toward the bottom edge
  close(worldUpAccel(0, 3, 0, ...g), 3);
  close(worldUpAccel(0, -2, 0, ...g), -2);
  close(worldUpAccel(5, 0, 5, ...g), 0); // sideways and toward/away from you aren't "up"
});

test('upside down: the phone’s +y is down', () => {
  close(worldUpAccel(0, 3, 0, 0, G, 0), -3);
});

test('lying flat, screen up: up is the phone’s +z', () => {
  close(worldUpAccel(0, 0, 4, 0, 0, -G), 4);
  close(worldUpAccel(0, 4, 0, 0, 0, -G), 0);
});

test('mid pan-flip at 45°: an upward push split across y and z still counts fully', () => {
  const s = Math.SQRT1_2; // sin 45° = cos 45°
  const g = [0, -G * s, -G * s] as const; // top tipped back 45°
  close(worldUpAccel(0, 2 * s, 2 * s, ...g), 2); // 2 m/s² straight up, seen on two axes
});

test('no gravity reading → no up', () => {
  close(worldUpAccel(1, 2, 3, 0, 0, 0), 0);
});
