# Just Dyno

A 2D mobile climbing game for iOS and Android. The player presses and holds to stay on the wall (hands on a hold, feet on footholds), physically pumps the phone up and down to bounce like a real dyno, and releases at the top of the drive to jump to the next hold. Side project, about 3 hours on weekends, no hard deadline — more of a lifestyle business vibe.

Full plan and roadmap: https://claude.ai/code/artifact/d0df37d9-6ead-42f2-8bc0-2121e4731411

# How we work on this project

This is a personal project I'm building to have fun, learn, sharpen my engineering skills for interviews, and maybe make some side money. Speed matters less than me understanding and owning every decision.

## Roles

- I own the architecture decisions: data model, system boundaries, APIs, tech choices, and tradeoffs.
- For any meaningful design choice, give me 2–3 options with tradeoffs and a recommendation, then wait for my call. Don't decide silently.
- If you think a decision I made is wrong, say so directly and explain why before you implement it.
- Push back if I'm overbuilding. Scope rule: the swing must be fun on its own before any new mechanic, backend or monetization work starts.
- Sessions are about 3 hours. Keep tasks small and leave the app runnable at the end of each session.
- I'm an experienced frontend TypeScript engineer but new to games. Briefly explain game-specific concepts (fixed timestep, integration, filtering) the first time they come up.
- Goals in priority order: learn and have fun; a system design story for interviews; a small chance of income.

## Before writing code

- For any feature bigger than a small fix, first restate the plan in a few bullets: files touched, data flow, and any new dependencies. Wait for my OK.

## While writing code

- Keep changes small and focused, one concern per change.
- Prefer simple, readable code over clever code. No new dependencies without asking.
- Add brief comments only where the "why" isn't obvious.

## After writing code

- Summarize what you changed and why, in plain language.
- Point out the single most important thing in the diff I should understand, and any edge cases or weaknesses you know about.
- Suggest one small piece of the next step that I could write by hand for practice, ideally something in the part of the stack that's new to me.

## Git

- Commit and push directly to `main`; no feature branches for this solo project.
- Only commit or push when I ask.
- Keep one concern per commit where practical (e.g. code and docs separately).

## Hand-written code

- When I write code myself, review it like a senior engineer: correctness, edge cases, naming, and how it would hold up at scale.
- Don't rewrite it for me unless I ask. Explain, and let me fix it.

## Decision log

When we make a meaningful design decision, append an entry to `DECISIONS.md`:

```md
## YYYY-MM-DD — The decision, in one line
- **Alternatives:** What else we considered.
- **Why:** The real reasoning, for future me.
- **Interview:**
  - Problem: ...
  - Tradeoff: ...
  - Revisit if: ...
```

- **Why** is a note to myself: the constraints, facts and tradeoffs behind the choice. Terse is fine.
- **Interview** is talking points, not a script: 2–4 short bullets I can speak from. Cover the problem, the tradeoff I made, and what would make me revisit it. Keep them plain enough for a recruiter and specific enough for an engineer, and don't copy Why.

## Stack (decided)

- React Native with Expo, TypeScript.
- Rendering: `@shopify/react-native-skia`. Never render game objects as React components; the game loop stays outside React's render cycle.
- Sensors: `expo-sensors` `DeviceMotion`, using `acceleration` (gravity removed), not the raw accelerometer. iOS reports the negative of the device's acceleration and Android doesn't; `src/sensors/phoneAccel.ts` normalizes so positive = phone accelerating right / up. Read sensors only through that module.
- Game loop: start on the JS thread with `requestAnimationFrame`. Move to Reanimated worklets only if it janks.
- Haptics: `expo-haptics`.
- Expo Go for now; a development build later (needed for in-app purchases).
- Project layout: a single Expo app with a top-level `sim/` folder. `eslint.config.js` and `sim/tsconfig.json` enforce the simulation rules below. Run `npm run lint`, `npm run typecheck` and `npm test` before calling a task done. Sim tests live next to the code (`sim/*.test.ts`) and run on Node directly.

## Simulation rules

The simulation will later run on the server to replay and validate scores, so it must be deterministic and portable.

- Keep simulation code in `sim/` with no React Native or Expo imports, so it can become a shared package.
- Fixed timestep: `DT = 1 / 120`, stepped with an accumulator, independent of frame rate.
- Verlet integration. Use only `+ - * /` and `Math.sqrt`. No `Math.sin`, `Math.cos`, `Math.random` or `Date` inside the sim: transcendental functions are not guaranteed identical across Hermes (phone) and V8 (server).
- Inputs are rounded to small integers once per step before entering the sim. The sim consumes only these recorded inputs.
- Input filtering and the response curve live inside the sim and run on the recorded raw inputs.
- Level generation uses a seeded PRNG (e.g. `mulberry32`), never `Math.random`.

## Core mechanic

A real dyno, seen from the front: hands on a hold, feet on footholds. The climber sags into a squat, drives up with the legs, and lets go at the top of the drive to fly to the next hold. **Phone down → the climber squats; phone up → he rises, and leaves the footholds if moving fast enough. Tilt the phone left/right → he leans that way and holds the lean.**

- **Sideways = tilt:** the input is gravity along the phone's x axis (`accelerationIncludingGravity.x − acceleration.x` = 9.81 × sin(tilt), + when the right edge is down). Absolute, so no drift, rebound or fade, and no trig in the sim: target lean = (tilt input / gravity) × `leanX`.
- **Vertical = up in the room, not along the phone:** the sensor module projects the phone's 3-axis acceleration onto the direction opposite gravity (`sim/worldUp.ts`), so rotating moves like a pan flip count, whatever the grip.
- **Vertical movement estimate:** the sensor only gives acceleration. `sim/phoneMotion.ts` integrates vertical acceleration twice into an estimated phone displacement with a **leaky integrator**: each estimate decays toward zero over `leakTime` (~0.4 s), so quick swings come through and drift or a phone held still fades to neutral. Consequence: a squat can't be held; it fades back in about half a second.
- **Settling after a swing:** once the phone has been still for ~80 ms, the estimate drops its leftover velocity and returns to neutral over `settleTime` (0.25 s), and the legs damp harder (`settleDamp`), so the climber settles instead of wobbling. During a swing nothing changes. (A version that changed in-swing behavior too measured better headlessly but felt much worse on device; see DECISIONS.md.)
- **Body:** one point mass at the hips, Verlet-integrated, in meters and seconds.
- **Legs act only through the feet:** a passive spring holds the body's weight, an active pull (`followK`) moves the hips toward the target (x from tilt; y = rest + `followY × phone displacement`), and damping absorbs motion. Legs push and can't pull: once they straighten, the feet leave and flight is undamped. A fast upward swing carries the hips past full extension (liftoff); a slow one doesn't.
- **Arms are a rope** to the hand hold: they stop the body sagging below a straight-arm hang and can only pull, never push.
- **Release** (lift the finger, step 4): the hands let go; if the hips are flying upward, the climber reaches for the next hold. Catch it if the hands come within reach.
- **Drawing:** a stick figure with adult proportions, posed from the hip point. Limbs are cosmetic, not simulated.

```ts
const DT = 1 / 120;
// Front view. x right, y down, meters. Inputs are quantized m/s²: tilt (gravity on phone x) and vertical accel.
function step(c: Climber, p: Params, inTilt: number, inY: number, holding: boolean) {
  updatePhoneMotion(c.phone, inY, p.leakTime, p.settleTime); // leaky double integration → c.phone.dy
  let ax = 0;
  let ay = p.gravity;
  if (feetPlanted(c.body, p)) {
    const targetX = (dequantize(inTilt) / p.gravity) * p.leanX; // tilt right → lean right
    const targetY = restY(p) - c.phone.dy * p.followY; // phone up → hips up
    ay -= p.legK * (p.legRest - (FOOT_Y - c.body.y)); // passive spring holds the weight
    ax += p.followK * (targetX - c.body.x);
    ay += p.followK * (targetY - c.body.y);
  }
  // Verlet step (damped only while planted; settleDamp once the phone is still), then the pull-only rope if holding.
}
```

Motion is the main input. Touch is an unranked assist mode: dragging a finger moves the same target directly (no integration needed), through the same physics.

Sensitivity should reward deliberate swings over size: the leaky integrator already ignores slow drift. Still to come (step 3b): a soft deadzone for hand tremor, a compressed response curve with a cap, and strong feedback (haptic tick on liftoff). Raising follow gain alone amplifies tremor and bumps.

## Current phase: weekend 1 prototype

One question: does swinging the phone down and up, then releasing, feel like a dyno? Success means reaching the next hold with a dip and a drive (maybe one warm-up bounce), and feeling that your movement caused it.

1. ✅ Create the Expo app, add Skia and `expo-sensors`, run on iPhone in Expo Go.
2. ✅ Sensor debug screen: a live graph of sideways and up/down acceleration, to see noise and update rate.
3. Climber on the wall: fixed 120 Hz timestep, legs and rope arms, hips follow the phone's movement. Stick figure. Tuning controls. (3a: physics and controls. 3b: deadzone, response curve, haptics.)
4. Hold to stay on, release to fly. A next hold above with a catch radius, a fall state, a reset button.
5. Finger drag as a second input (same physics).
6. Play it and write down the parameter values that felt best.

Then the validation test: play both modes standing, sitting, in bed and as a car passenger; hand it to 3 people with no explanation.

- **Pass:** most build a bounce with up-and-down motion and reach the next hold within about 30 seconds, and enjoy it.
- **Fail:** most can't, or clearly prefer touch.

## Open decisions (ask me, don't decide)

- Game loop thread: JS thread first vs Reanimated worklets.
- Move chaining in version 1: paddles only (recommended) vs more.
- Backend provider: Supabase (recommended) vs Cloudflare Workers with D1 vs AWS.
- Monetization: free with a one-time Supporter purchase (recommended).
