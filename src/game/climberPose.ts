import { FOOT_Y } from '../../sim';

// Cosmetic only: poses a stick figure around the simulated hip point. Nothing here feeds
// back into the sim, so it's free to use any math. Meters, x right, y down, hold at origin.
// Segment lengths are typical adult proportions for a ~1.75 m climber.

const TORSO = 0.5; // hip joints to shoulder joints
const NECK = 0.08; // shoulder line to the bottom of the head
export const HEAD_RADIUS = 0.11;
const UPPER_ARM = 0.3;
const FOREARM = 0.3; // elbow to center of grip
const THIGH = 0.45;
const SHIN = 0.45;
const SHOULDER_HALF_WIDTH = 0.19;
const HIP_HALF_WIDTH = 0.09;
const HAND_SPREAD = 0.07; // each hand's offset from the hold's center
const FOOT_SPREAD = 0.25; // each foothold's offset from center

type Point = { x: number; y: number };
type Side = { shoulder: Point; elbow: Point; hand: Point; hip: Point; knee: Point; foot: Point };
export type Pose = { pelvis: Point; neck: Point; head: Point; left: Side; right: Side };

export function poseFigure(hipX: number, hipY: number): Pose {
  const pelvis = { x: hipX, y: hipY };
  const neck = { x: hipX * 0.6, y: hipY - TORSO }; // upper body leans less than the hips
  const head = { x: neck.x, y: neck.y - NECK - HEAD_RADIUS };
  const side = (s: -1 | 1): Side => {
    const shoulder = { x: neck.x + s * SHOULDER_HALF_WIDTH, y: neck.y };
    const hip = { x: pelvis.x + s * HIP_HALF_WIDTH, y: pelvis.y };
    const hand = reach(shoulder, { x: s * HAND_SPREAD, y: 0 }, UPPER_ARM + FOREARM);
    const foot = reach(hip, { x: s * FOOT_SPREAD, y: FOOT_Y }, THIGH + SHIN);
    return {
      shoulder,
      elbow: joint(shoulder, hand, UPPER_ARM, FOREARM, s), // elbows out
      hand,
      hip,
      knee: joint(hip, foot, THIGH, SHIN, s), // knees out, frog-style
      foot,
    };
  };
  return { pelvis, neck, head, left: side(-1), right: side(1) };
}

/** `target`, or the farthest point toward it a limb of length `len` can reach from `root`. */
function reach(root: Point, target: Point, len: number): Point {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = Math.hypot(dx, dy);
  if (d <= len) return target;
  return { x: root.x + (dx * len) / d, y: root.y + (dy * len) / d };
}

/**
 * Two-bone joint (elbow or knee) between `root` and `end`: the point that is `a` from root
 * and `b` from end, bent toward side `bend` (-1 left, 1 right). Straight if out of reach.
 */
function joint(root: Point, end: Point, a: number, b: number, bend: -1 | 1): Point {
  const dx = end.x - root.x;
  const dy = end.y - root.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return root;
  const d = Math.min(len, a + b - 1e-6);
  const along = (a * a - b * b + d * d) / (2 * d); // distance from root to the joint's foot point
  const out = Math.sqrt(Math.max(0, a * a - along * along)); // how far the joint sticks out
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular to root→end, flipped so its x points toward the `bend` side.
  const sign = -uy * bend >= 0 ? 1 : -1;
  return { x: root.x + ux * along - uy * sign * out, y: root.y + uy * along + ux * sign * out };
}
