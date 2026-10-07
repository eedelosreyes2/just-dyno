# Just Dyno

A 2D mobile climbing game for iOS and Android. The player presses and holds to hang from a hold, physically pumps the phone (mainly up and down) to build a swing, and releases at the right moment to dyno to the next hold. Side project, about 3 hours on weekends, no hard deadline — more of a lifestyle business vibe.

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
- Sensors: `expo-sensors` `DeviceMotion`, using `acceleration` (gravity removed), not the raw accelerometer.
- Game loop: start on the JS thread with `requestAnimationFrame`. Move to Reanimated worklets only if it janks.
- Haptics: `expo-haptics`.
- Expo Go for now; a development build later (needed for in-app purchases).
- Project layout: a single Expo app with a top-level `sim/` folder. `eslint.config.js` and `sim/tsconfig.json` enforce the simulation rules below. Run `npm run lint` and `npm run typecheck` before calling a task done.

## Simulation rules

The simulation will later run on the server to replay and validate scores, so it must be deterministic and portable.

- Keep simulation code in `sim/` with no React Native or Expo imports, so it can become a shared package.
- Fixed timestep: `DT = 1 / 120`, stepped with an accumulator, independent of frame rate.
- Verlet integration. Use only `+ - * /` and `Math.sqrt`. No `Math.sin`, `Math.cos`, `Math.random` or `Date` inside the sim: transcendental functions are not guaranteed identical across Hermes (phone) and V8 (server).
- Inputs are rounded to small integers once per step before entering the sim. The sim consumes only these recorded inputs.
- Input filtering and the response curve live inside the sim and run on the recorded raw inputs.
- Level generation uses a seeded PRNG (e.g. `mulberry32`), never `Math.random`.

## Core mechanic

Moving-pivot pendulum: the hold is the pivot, and the phone's acceleration in both axes pushes the climber the opposite way, like a yo-yo hanging from a hand. Tune arm length and gravity so one full swing takes about 1.2–1.6 seconds.

- **Up and down is the main pump.** Moving the pivot vertically changes the effective gravity, which amplifies an existing swing (parametric pumping, like standing and squatting on a playground swing). The rhythm is twice per swing: pull as the climber passes the bottom. It cannot start a swing from rest and has no left/right bias.
- **Sideways starts and nudges the swing.** It pushes the climber directly, once per swing, so any natural wobble gets a swing going.
- Separate gains per axis; tune vertical to be the strong one. Pumping in rhythm grows the swing; out of rhythm shrinks it.

```ts
const DT = 1 / 120;
// Screen coordinates: x right, y down. Phone axes (portrait): x right, y up.
function step(s: Body, phoneAx: number, phoneAy: number) {
  const ax = -phoneAx * GAIN_X; // phone moves right → climber pushed left
  const ay = GRAVITY + phoneAy * GAIN_Y; // phone moves up → climber feels heavier (pushed down)
  const nx = s.x + (s.x - s.px) * DAMP + ax * DT * DT;
  const ny = s.y + (s.y - s.py) * DAMP + ay * DT * DT;
  const dx = nx - hold.x,
    dy = ny - hold.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  s.px = s.x;
  s.py = s.y;
  s.x = hold.x + (dx * ARM) / d;
  s.y = hold.y + (dy * ARM) / d;
}
// Release: velocity = (x - px) / DT, then projectile flight until a hold is in reach.
```

Motion is the main input. Touch is an unranked assist mode: dragging a finger in rhythm feeds the same pivot acceleration (both axes) into the same physics.

Sensitivity should reward timing over size: a light band-pass filter around the swing rhythm, a compressed response curve with a cap, a soft deadzone, and strong feedback (haptic tick per good pump). Raising gain alone amplifies tremor and bumps.

## Current phase: weekend 1 prototype

One question: does pumping the phone to swing, then releasing, feel good? Success means reaching the next hold in 3–5 pumps and feeling that your movement caused it.

1. Create the Expo app, add Skia and `expo-sensors`, run on iPhone in Expo Go.
2. Sensor debug screen: a live graph of sideways and up/down acceleration, to see noise and update rate.
3. Pendulum: fixed 120 Hz timestep, the Verlet step, drawn as a line and a circle. On-screen sliders for gain (per axis), damping, arm length, filter on/off, curve strength and deadzone.
4. Hold to hang, release to fly. A second hold with a catch radius, a fall state, a reset button.
5. Finger drag as a second input (same physics).
6. Play it and write down the parameter values that felt best.

Then the validation test: play both modes standing, sitting, in bed and as a car passenger; hand it to 3 people with no explanation.

- **Pass:** most build a swing with up-and-down motion within about 30 seconds and enjoy it.
- **Fail:** most can't, or clearly prefer touch.

## Open decisions (ask me, don't decide)

- Camera view: front view (recommended) vs side view vs hybrid. 2D for version 1.
- Game loop thread: JS thread first vs Reanimated worklets.
- Move chaining in version 1: paddles only (recommended) vs more.
- Backend provider: Supabase (recommended) vs Cloudflare Workers with D1 vs AWS.
- Monetization: free with a one-time Supporter purchase (recommended).
