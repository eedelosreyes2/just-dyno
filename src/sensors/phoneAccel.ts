import { DeviceMotion } from 'expo-sensors';
import { Platform } from 'react-native';

import { worldUpAccel } from '../../sim';

// Ask for ~100 Hz. iOS caps DeviceMotion around there; the debug screen shows the real rate.
const UPDATE_INTERVAL_MS = 10;

// Expo passes platform values through unchanged, and the platforms disagree on sign:
// Android (TYPE_LINEAR_ACCELERATION) reports the device's actual acceleration, while iOS
// (CoreMotion userAcceleration) reports its negative. Normalize so that everywhere
// downstream, positive x = phone accelerating right, positive y = phone accelerating up.
const SIGN = Platform.OS === 'ios' ? -1 : 1;

/**
 * Fixed-size ring buffer of phone acceleration samples: x = along the phone's sideways
 * axis, y = up in the room. Normalized so positive means accelerating right / up.
 * Preallocated so recording a sample allocates nothing; when full, the oldest sample
 * is overwritten.
 */
export type SampleBuffer = {
  readonly x: Float64Array; // sideways acceleration, m/s² (gravity removed)
  readonly y: Float64Array; // acceleration up in the room, m/s² (gravity removed), any phone orientation
  readonly tilt: Float64Array; // gravity along the phone's x axis, m/s²: + when the right edge is down
  readonly t: Float64Array; // sensor timestamp, seconds
  head: number; // index the next sample is written to
  count: number; // number of valid samples, up to capacity
  nullCount: number; // events that arrived without an `acceleration` reading
};

export function createSampleBuffer(capacity: number): SampleBuffer {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    tilt: new Float64Array(capacity),
    t: new Float64Array(capacity),
    head: 0,
    count: 0,
    nullCount: 0,
  };
}

/** Buffer index of the i-th valid sample, where i = 0 is the oldest. */
export function sampleIndex(buffer: SampleBuffer, i: number): number {
  const capacity = buffer.t.length;
  return (buffer.head - buffer.count + i + capacity) % capacity;
}

/**
 * Starts recording sideways acceleration, world-up acceleration and tilt into `buffer`.
 * Resolves to an unsubscribe function, or null if the device has no motion sensor.
 */
export async function startPhoneAccel(buffer: SampleBuffer): Promise<(() => void) | null> {
  if (!(await DeviceMotion.isAvailableAsync())) return null;

  DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
  const subscription = DeviceMotion.addListener(({ acceleration, accelerationIncludingGravity }) => {
    if (!acceleration) {
      buffer.nullCount++;
      return;
    }
    // Gravity in the phone's axes, pointing toward the earth. Expo already reports this
    // the same way on both platforms, so unlike `acceleration` it needs no sign fix.
    const gx = accelerationIncludingGravity.x - acceleration.x;
    const gy = accelerationIncludingGravity.y - acceleration.y;
    const gz = accelerationIncludingGravity.z - acceleration.z;
    const ax = SIGN * acceleration.x;
    buffer.x[buffer.head] = ax;
    // "Up" in the room, not along the phone, so rotating moves like a pan flip still count.
    buffer.y[buffer.head] = worldUpAccel(ax, SIGN * acceleration.y, SIGN * acceleration.z, gx, gy, gz);
    // Gravity's component on x is 9.81 × sin(tilt), so it measures tilt without any trig.
    buffer.tilt[buffer.head] = gx;
    buffer.t[buffer.head] = acceleration.timestamp;
    buffer.head = (buffer.head + 1) % buffer.t.length;
    if (buffer.count < buffer.t.length) buffer.count++;
  });

  return () => subscription.remove();
}

/** Newest sample in m/s², or zeros before the first sample arrives. */
export function latestSample(buffer: SampleBuffer): { x: number; y: number; tilt: number } {
  if (buffer.count === 0) return { x: 0, y: 0, tilt: 0 };
  const j = sampleIndex(buffer, buffer.count - 1);
  return { x: buffer.x[j], y: buffer.y[j], tilt: buffer.tilt[j] };
}
