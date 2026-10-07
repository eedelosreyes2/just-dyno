import { DeviceMotion } from 'expo-sensors';

// Ask for ~100 Hz. iOS caps DeviceMotion around there; the debug screen shows the real rate.
const UPDATE_INTERVAL_MS = 10;

/**
 * Fixed-size ring buffer of phone acceleration samples (portrait: x = sideways,
 * y = up and down). Preallocated so recording a sample allocates nothing; when full,
 * the oldest sample is overwritten.
 */
export type SampleBuffer = {
  readonly x: Float64Array; // sideways acceleration, m/s² (gravity removed)
  readonly y: Float64Array; // up and down acceleration, m/s² (gravity removed)
  readonly t: Float64Array; // sensor timestamp, seconds
  head: number; // index the next sample is written to
  count: number; // number of valid samples, up to capacity
  nullCount: number; // events that arrived without an `acceleration` reading
};

export function createSampleBuffer(capacity: number): SampleBuffer {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
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
 * Starts recording `acceleration.x` and `.y` into `buffer`.
 * Resolves to an unsubscribe function, or null if the device has no motion sensor.
 */
export async function startPhoneAccel(buffer: SampleBuffer): Promise<(() => void) | null> {
  if (!(await DeviceMotion.isAvailableAsync())) return null;

  DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
  const subscription = DeviceMotion.addListener(({ acceleration }) => {
    if (!acceleration) {
      buffer.nullCount++;
      return;
    }
    buffer.x[buffer.head] = acceleration.x;
    buffer.y[buffer.head] = acceleration.y;
    buffer.t[buffer.head] = acceleration.timestamp;
    buffer.head = (buffer.head + 1) % buffer.t.length;
    if (buffer.count < buffer.t.length) buffer.count++;
  });

  return () => subscription.remove();
}
