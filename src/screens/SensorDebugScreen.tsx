import { Canvas, Line, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import {
  createSampleBuffer,
  sampleIndex,
  startPhoneAccel,
  type SampleBuffer,
} from '../sensors/phoneAccel';

const WINDOW_S = 3; // seconds of history shown
const CAPACITY = 512; // > 3 s at 100 Hz, with headroom
const Y_RANGE = 10; // m/s² at the top and bottom edge of the graph
const GRAPH_HEIGHT = 320;
const GRIDLINES = [-5, -2, 2, 5]; // m/s²
const STATS_INTERVAL_MS = 250;
const X_COLOR = '#3d7be8'; // sideways
const Y_COLOR = '#e8a33d'; // up and down

type Axis = 'x' | 'y';
type Range = { min: number; max: number };
type Stats = { hz: number; x: Range; y: Range; nulls: number };
type Status = 'starting' | 'running' | 'unavailable';

export function SensorDebugScreen() {
  const { width } = useWindowDimensions();
  // Skia watches these shared values and redraws when they change, without a React render.
  const xTrace = useSharedValue<SkPath>(Skia.Path.Make());
  const yTrace = useSharedValue<SkPath>(Skia.Path.Make());
  const [status, setStatus] = useState<Status>('starting');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const buffer = createSampleBuffer(CAPACITY);
    let stop: (() => void) | null = null;
    let frame = 0;
    let cancelled = false;

    const draw = () => {
      xTrace.set(buildTrace(buffer, 'x', width));
      yTrace.set(buildTrace(buffer, 'y', width));
      frame = requestAnimationFrame(draw);
    };

    startPhoneAccel(buffer).then((unsubscribe) => {
      // The screen may have unmounted while we were checking availability.
      if (cancelled) return unsubscribe?.();
      if (!unsubscribe) return setStatus('unavailable');
      stop = unsubscribe;
      setStatus('running');
      frame = requestAnimationFrame(draw);
    });

    // Text readouts are React state, so throttle them to a few renders per second.
    const statsTimer = setInterval(() => setStats(computeStats(buffer)), STATS_INTERVAL_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearInterval(statsTimer);
      stop?.();
    };
  }, [width, xTrace, yTrace]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phone acceleration (m/s²)</Text>
      <Canvas style={{ width, height: GRAPH_HEIGHT }}>
        {GRIDLINES.map((value) => (
          <Line
            key={value}
            p1={vec(0, toY(value))}
            p2={vec(width, toY(value))}
            color={Math.abs(value) === 2 ? '#ddd' : '#f0c8c8'}
            strokeWidth={1}
          />
        ))}
        <Line p1={vec(0, toY(0))} p2={vec(width, toY(0))} color="#999" strokeWidth={1} />
        <Path path={xTrace} color={X_COLOR} style="stroke" strokeWidth={2} />
        <Path path={yTrace} color={Y_COLOR} style="stroke" strokeWidth={2} />
      </Canvas>
      <Text style={styles.legend}>
        <Text style={{ color: X_COLOR }}>■ sideways (x)</Text>
        {'   '}
        <Text style={{ color: Y_COLOR }}>■ up/down (y)</Text>
        {`\nGrid: 0, ±2 (grey), ±5 (red) m/s² · last ${WINDOW_S} s`}
      </Text>
      <View style={styles.readouts}>
        {status === 'unavailable' ? (
          <Text>Motion sensor unavailable on this device (the iOS Simulator has none).</Text>
        ) : (
          <>
            <Text style={styles.readout}>Rate: {stats ? stats.hz.toFixed(1) : '–'} Hz</Text>
            <Text style={styles.readout}>Sideways min / max: {formatRange(stats?.x)} m/s²</Text>
            <Text style={styles.readout}>Up/down min / max: {formatRange(stats?.y)} m/s²</Text>
            <Text style={styles.readout}>Null samples: {stats ? stats.nulls : '–'}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function formatRange(range: Range | undefined): string {
  return range ? `${range.min.toFixed(2)} / ${range.max.toFixed(2)}` : '–';
}

/** Maps acceleration to a canvas y, clamped so spikes stay on screen. */
function toY(accel: number): number {
  const clamped = Math.max(-Y_RANGE, Math.min(Y_RANGE, accel));
  return GRAPH_HEIGHT / 2 - (clamped / Y_RANGE) * (GRAPH_HEIGHT / 2);
}

/** Builds one axis's trace for the last WINDOW_S seconds; newest sample at the right edge. */
function buildTrace(buffer: SampleBuffer, axis: Axis, width: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  if (buffer.count === 0) return builder.build();
  const values = buffer[axis];
  const newest = buffer.t[sampleIndex(buffer, buffer.count - 1)];
  let started = false;
  for (let i = 0; i < buffer.count; i++) {
    const j = sampleIndex(buffer, i);
    const age = newest - buffer.t[j];
    if (age > WINDOW_S) continue;
    const x = width * (1 - age / WINDOW_S);
    const y = toY(values[j]);
    if (started) builder.lineTo(x, y);
    else {
      builder.moveTo(x, y);
      started = true;
    }
  }
  return builder.build();
}

/** Rate from sensor timestamps (not event counts per timer tick), plus range, over the window. */
function computeStats(buffer: SampleBuffer): Stats | null {
  if (buffer.count < 2) return null;
  const newest = buffer.t[sampleIndex(buffer, buffer.count - 1)];
  let n = 0;
  let oldest = newest;
  const x = { min: Infinity, max: -Infinity };
  const y = { min: Infinity, max: -Infinity };
  for (let i = 0; i < buffer.count; i++) {
    const j = sampleIndex(buffer, i);
    if (newest - buffer.t[j] > WINDOW_S) continue;
    n++;
    oldest = Math.min(oldest, buffer.t[j]);
    x.min = Math.min(x.min, buffer.x[j]);
    x.max = Math.max(x.max, buffer.x[j]);
    y.min = Math.min(y.min, buffer.y[j]);
    y.max = Math.max(y.max, buffer.y[j]);
  }
  const span = newest - oldest;
  return { hz: span > 0 ? (n - 1) / span : 0, x, y, nulls: buffer.nullCount };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 80,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  legend: {
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 8,
    lineHeight: 22,
  },
  readouts: {
    padding: 16,
    gap: 6,
  },
  readout: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
