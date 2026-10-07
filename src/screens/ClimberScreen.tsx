import {
  Canvas,
  Circle,
  Path,
  RoundedRect,
  Skia,
  vec,
  type SkPath,
  type SkPoint,
} from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import {
  createClimber,
  DEFAULT_PARAMS,
  DT,
  FOOT_Y,
  feetPlanted,
  quantize,
  restY,
  step,
  type Climber,
  type Params,
} from '../../sim';
import { startLoop } from '../game/loop';
import { createSampleBuffer, latestSample, startPhoneAccel } from '../sensors/phoneAccel';
import { HEAD_RADIUS, poseFigure, type Pose } from '../game/climberPose';

const VIEW_TOP = -0.35; // m above the hand hold shown at the top of the canvas
const VIEW_BOTTOM = FOOT_Y + 0.12; // m, just below the footholds
const CANVAS_HEIGHT = 380;
const PX_PER_M = CANVAS_HEIGHT / (VIEW_BOTTOM - VIEW_TOP);
const STATS_INTERVAL_MS = 250;

type Control = {
  key: keyof Params;
  label: string;
  step: number;
  min: number;
  max: number;
  digits: number;
};

const CONTROLS: Control[] = [
  { key: 'followY', label: 'Follow up/down (×)', step: 0.25, min: 0, max: 6, digits: 2 },
  { key: 'leanX', label: 'Lean per tilt (m)', step: 0.05, min: 0, max: 1.5, digits: 2 },
  { key: 'followK', label: 'Leg power', step: 10, min: 30, max: 400, digits: 0 },
  { key: 'leakTime', label: 'Fade to neutral (s)', step: 0.05, min: 0.1, max: 1.5, digits: 2 },
  { key: 'damp', label: 'Damping (kept/step)', step: 0.0025, min: 0.9, max: 1, digits: 4 },
  { key: 'settleDamp', label: 'Settle damping (after)', step: 0.01, min: 0.7, max: 1, digits: 2 },
];

type Stats = { rise: number; peakRise: number; peakUpSpeed: number; liftoffs: number; feetOff: boolean };

export function ClimberScreen() {
  const { width } = useWindowDimensions();
  const centerX = width / 2;
  const toScreen = (x: number, y: number): SkPoint =>
    vec(centerX + x * PX_PER_M, (y - VIEW_TOP) * PX_PER_M);

  // Sim state lives in refs: the loop mutates it every step, and React never sees it.
  const params = useRef<Params>({ ...DEFAULT_PARAMS });
  const climber = useRef<Climber>(createClimber(DEFAULT_PARAMS));
  const peaks = useRef({ rise: 0, upSpeed: 0, liftoffs: 0, wasPlanted: true });

  // Skia redraws from these without React re-rendering.
  const limbs = useSharedValue<SkPath>(Skia.Path.Make());
  const head = useSharedValue<SkPoint>(vec(0, 0));

  // React state only for the control labels and throttled readouts.
  const [shownParams, setShownParams] = useState<Params>(DEFAULT_PARAMS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sensorOk, setSensorOk] = useState(true);

  useEffect(() => {
    const buffer = createSampleBuffer(64);
    let stopSensor: (() => void) | null = null;
    let cancelled = false;
    startPhoneAccel(buffer).then((unsubscribe) => {
      if (cancelled) return unsubscribe?.();
      if (!unsubscribe) setSensorOk(false);
      stopSensor = unsubscribe;
    });

    const project = (x: number, y: number): SkPoint =>
      vec(centerX + x * PX_PER_M, (y - VIEW_TOP) * PX_PER_M);

    const stopLoop = startLoop({
      readInput: () => {
        const sample = latestSample(buffer);
        return { x: quantize(sample.tilt), y: quantize(sample.y) }; // sideways comes from tilt
      },
      step: (inputX, inputY) => step(climber.current, params.current, inputX, inputY, true),
      render: () => {
        const b = climber.current.body;
        const pose = poseFigure(b.x, b.y);
        limbs.set(buildLimbs(pose, project));
        head.set(project(pose.head.x, pose.head.y));
        const p = params.current;
        peaks.current.rise = Math.max(peaks.current.rise, restY(p) - b.y);
        // Verlet velocity, shown in m/s for intuition (not used by the sim).
        peaks.current.upSpeed = Math.max(peaks.current.upSpeed, -(b.y - b.py) / DT);
        const planted = feetPlanted(b, p);
        if (peaks.current.wasPlanted && !planted) peaks.current.liftoffs++;
        peaks.current.wasPlanted = planted;
      },
    });

    const statsTimer = setInterval(() => {
      const p = params.current;
      setStats({
        rise: restY(p) - climber.current.body.y,
        peakRise: peaks.current.rise,
        peakUpSpeed: peaks.current.upSpeed,
        liftoffs: peaks.current.liftoffs,
        feetOff: !peaks.current.wasPlanted,
      });
    }, STATS_INTERVAL_MS);

    return () => {
      cancelled = true;
      stopLoop();
      clearInterval(statsTimer);
      stopSensor?.();
    };
  }, [centerX, limbs, head]);

  const adjust = (control: Control, direction: 1 | -1) => {
    const next = params.current[control.key] + direction * control.step;
    // Round to the control's precision so repeated taps don't accumulate float error.
    const rounded = Number(Math.max(control.min, Math.min(control.max, next)).toFixed(control.digits));
    params.current = { ...params.current, [control.key]: rounded };
    setShownParams(params.current);
  };

  const reset = () => {
    climber.current = createClimber(params.current);
    peaks.current = { rise: 0, upSpeed: 0, liftoffs: 0, wasPlanted: true };
  };

  const handHold = toScreen(0, 0);
  return (
    <View style={styles.container}>
      <Canvas style={{ width, height: CANVAS_HEIGHT }}>
        <RoundedRect x={handHold.x - 28} y={handHold.y - 8} width={56} height={14} r={6} color="#e8a33d" />
        {[-1, 1].map((side) => {
          const foot = toScreen(side * 0.25, FOOT_Y);
          return (
            <RoundedRect key={side} x={foot.x - 16} y={foot.y} width={32} height={10} r={4} color="#b07a2a" />
          );
        })}
        <Path path={limbs} color="#3d7be8" style="stroke" strokeWidth={6} strokeCap="round" strokeJoin="round" />
        <Circle c={head} r={HEAD_RADIUS * PX_PER_M} color="#3d7be8" />
      </Canvas>

      <View style={styles.panel}>
        {!sensorOk && <Text style={styles.warning}>No motion sensor here. Run on your phone to pump.</Text>}
        <Text style={styles.readout}>
          Rise {stats ? (stats.rise * 100).toFixed(0) : '–'} cm · Peak {stats ? (stats.peakRise * 100).toFixed(0) : '–'} cm ·
          Up {stats ? stats.peakUpSpeed.toFixed(1) : '–'} m/s · Liftoffs {stats ? stats.liftoffs : '–'}
        </Text>
        <Text style={[styles.feet, stats?.feetOff && styles.feetOff]}>
          {stats?.feetOff ? 'Feet off!' : 'Feet planted'}
        </Text>

        {CONTROLS.map((control) => (
          <View key={control.key} style={styles.row}>
            <Text style={styles.label}>{control.label}</Text>
            <StepButton label="−" onPress={() => adjust(control, -1)} />
            <Text style={styles.value}>{shownParams[control.key].toFixed(control.digits)}</Text>
            <StepButton label="+" onPress={() => adjust(control, 1)} />
          </View>
        ))}

        <Pressable style={styles.action} onPress={reset}>
          <Text style={styles.actionText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.stepButton} onPress={onPress} hitSlop={6}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

/** One path for all limbs and the torso, so the figure is a single draw call. */
function buildLimbs(pose: Pose, project: (x: number, y: number) => SkPoint): SkPath {
  const builder = Skia.PathBuilder.Make();
  const polyline = (points: { x: number; y: number }[]) => {
    const [first, ...rest] = points.map((p) => project(p.x, p.y));
    builder.moveTo(first.x, first.y);
    for (const p of rest) builder.lineTo(p.x, p.y);
  };
  polyline([pose.pelvis, pose.neck]);
  polyline([pose.left.shoulder, pose.right.shoulder]);
  polyline([pose.left.hip, pose.right.hip]);
  for (const side of [pose.left, pose.right]) {
    polyline([side.shoulder, side.elbow, side.hand]);
    polyline([side.hip, side.knee, side.foot]);
  }
  return builder.build();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  panel: { paddingHorizontal: 16, gap: 10 },
  warning: { color: '#b45309' },
  readout: { fontSize: 15, fontVariant: ['tabular-nums'] },
  feet: { fontSize: 15, fontWeight: '600', color: '#888' },
  feetOff: { color: '#16a34a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, fontSize: 15 },
  value: { width: 64, textAlign: 'center', fontSize: 16, fontVariant: ['tabular-nums'] },
  stepButton: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, fontWeight: '600' },
  action: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#3d7be8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
