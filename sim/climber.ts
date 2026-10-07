import { DT } from './constants.ts';
import { dequantize } from './input.ts';
import { createPhoneMotion, phoneStill, updatePhoneMotion, type PhoneMotion } from './phoneMotion.ts';

// Front view. Units: meters and seconds. Coordinates: x right, y down.
// The hand hold is at the origin; the footholds are FOOT_Y below it.
// Phone down → squat, phone up → rise (and leave the footholds if fast enough).
// Tilt the phone left/right → lean that way.

/** Footholds, meters below the hand hold. Puts the resting pose in a crouch, as at the start of a dyno. */
export const FOOT_Y = 1.65;

export type Params = {
  gravity: number; // m/s²
  arm: number; // m, max hands-to-hips distance (straight arms)
  legRest: number; // m, hips height above the footholds with straight legs
  legK: number; // 1/s², passive leg spring per unit mass; holds the body's weight at rest
  damp: number; // fraction of velocity kept each step while the feet are planted (1 = none)
  followY: number; // hips travel per meter of phone travel, up/down
  leanX: number; // m of sideways hip travel per unit of tilt (sin of the tilt angle)
  followK: number; // 1/s², how hard the legs pull the hips toward the target
  leakTime: number; // s, how fast the phone-movement estimate fades back to neutral
  settleTime: number; // s, faster return to neutral once the phone has stopped moving
  settleDamp: number; // like `damp`, but once the phone has stopped: stronger, so the climber settles instead of wobbling
};

export const DEFAULT_PARAMS: Params = {
  gravity: 9.81,
  arm: 1.1, // straight-arm hang: torso (0.5) + shoulder-to-grip (0.6) for a ~1.75 m climber
  legRest: 0.9,
  legK: 55,
  damp: 0.975,
  followY: 2,
  leanX: 0.6, // ~20° tilt → ~20 cm lean
  followK: 150,
  leakTime: 0.4,
  settleTime: 0.25,
  settleDamp: 0.85,
};

/**
 * Verlet body: velocity is implied by (x - px, y - py) per step instead of being stored.
 * One point mass at the climber's hips; the limbs are drawn, not simulated.
 */
export type Body = { x: number; y: number; px: number; py: number };

/** Everything the sim steps: the climber's body and the estimate of the phone's movement. */
export type Climber = { body: Body; phone: PhoneMotion };

/** Resting height: where the bent legs alone hold the body's weight. */
export function restY(params: Params): number {
  return FOOT_Y - params.legRest + params.gravity / params.legK;
}

/** Climber at rest on the wall, centered under the hold, phone at neutral. */
export function createClimber(params: Params): Climber {
  const y = restY(params);
  return { body: { x: 0, y, px: 0, py: y }, phone: createPhoneMotion() };
}

/** Whether the legs are bent enough to push, i.e. the feet are on the footholds. */
export function feetPlanted(body: Body, params: Params): boolean {
  return FOOT_Y - body.y < params.legRest;
}

/**
 * Advances one fixed step. Inputs are quantized, in m/s²:
 * - `inputTilt`: gravity along the phone's x axis (+ = right edge down). Equals
 *   gravity × sin(tilt), so dividing by gravity gives the tilt without trig.
 * - `inputY`: phone acceleration, up = +.
 * `holding`: hands on the hold.
 */
export function step(
  climber: Climber,
  params: Params,
  inputTilt: number,
  inputY: number,
  holding: boolean,
): void {
  const { body, phone } = climber;
  updatePhoneMotion(phone, inputY, params.leakTime, params.settleTime);

  let ax = 0;
  let ay = params.gravity;

  // Legs only act through the feet. The passive spring holds the body's weight; the
  // active part pulls the hips toward where the phone says they should be. Legs push
  // and can't pull, so once they straighten, the feet leave and the body flies.
  const planted = feetPlanted(body, params);
  if (planted) {
    const targetX = (dequantize(inputTilt) / params.gravity) * params.leanX; // tilt right → lean right
    const targetY = restY(params) - phone.dy * params.followY; // phone up → hips up (screen y is down)
    ay -= params.legK * (params.legRest - (FOOT_Y - body.y));
    ax += params.followK * (targetX - body.x);
    ay += params.followK * (targetY - body.y);
  }

  // Damping models the legs absorbing motion (knees, muscles), so it only acts through the
  // feet. In the air or hanging free, motion is undamped, which keeps flight ballistic.
  // Once the phone has stopped, the legs damp harder so the climber settles after a swing
  // instead of wobbling; during a swing, damping is unchanged.
  const damp = planted ? (phoneStill(phone) ? params.settleDamp : params.damp) : 1;
  const nx = body.x + (body.x - body.px) * damp + ax * DT * DT;
  const ny = body.y + (body.y - body.py) * damp + ay * DT * DT;
  body.px = body.x;
  body.py = body.y;
  body.x = nx;
  body.y = ny;

  // Arms: a rope. Only pull back when the hips are farther than `arm` from the hands.
  if (holding) {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > params.arm) {
      body.x = (nx * params.arm) / d;
      body.y = (ny * params.arm) / d;
    }
  }
}
