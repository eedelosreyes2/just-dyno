# Decision log

Append a new entry at the bottom for each meaningful design decision. Format and guidance are in `CLAUDE.md` under "Decision log": **Why** is the reasoning for future me, **Interview** is talking points to speak from.

## 2026-10-02 — React Native with Expo for iOS and Android
- **Alternatives:** Godot, Unity, Phaser with Capacitor.
- **Why:** Stays in TypeScript. The physics can be a plain TS package shared with the server. A 2D game with few objects does not need a full engine.
- **Interview:**
  - Problem: 2D game with a few objects, and the physics must run on both phone and server
  - Tradeoff: no engine tooling, but one TypeScript sim codebase for client and server
  - Revisit if: 3D or heavy visual effects, where an engine earns its cost

## 2026-10-02 — Pump the swing by physically moving the phone (moving-pivot pendulum)
- **Superseded 2026-10-06** by "A real dyno: spring legs, rope arms" below. Kept for the history.
- **Alternatives:** Tilt angle steers the swing directly.
- **Why:** More skillful, grounded in real physics, and the same model gives the touch mode for free.
- **Interview:**
  - Problem: the input needs to feel physical and reward skill
  - Tradeoff: pumping the phone rewards timing, not just angle, so a higher skill ceiling than tilt-to-steer, but harder to learn
  - Bonus: input is just a force on a body, so finger drag reuses the same physics for a touch mode

## 2026-10-02 — Version 1 means playable on my own phone, with no hard deadline
- **Alternatives:** TestFlight for friends; store release; a strict 6-weekend deadline.
- **Why:** Treated as a lifestyle project. Store work is a later phase.
- **Interview:**
  - Problem: the biggest risk for a solo side project is that the core mechanic isn't fun
  - Tradeoff: no store, backend or monetization until a prototype proves the swing
  - Parallel: validate a feature before building infrastructure around it

## 2026-10-02 — Daily route generated on the client from the UTC date plus generator version
- **Alternatives:** Route served by a backend.
- **Why:** Works offline and needs no server. The version stops old app builds from showing a different wall.
- **Interview:**
  - Problem: everyone needs the same daily wall
  - Tradeoff: generated on device from a seeded PRNG keyed on the UTC date, so it works offline at zero cost, but generator changes become a compatibility risk
  - Fix: generator version is part of the key, like schema versioning for content

## 2026-10-02 — A backend exists mainly for interview value: replay-validated leaderboard and ghosts
- **Alternatives:** No backend at all.
- **Why:** The daily route does not need one, but replay validation is a strong system design story.
- **Interview:**
  - Problem: a leaderboard that trusts client-submitted scores is trivially cheatable
  - Approach: client uploads recorded inputs; server re-runs the deterministic sim and accepts only matching scores
  - Honest framing: the game doesn't strictly need a backend; this is the system design story, and it drove the determinism constraints

## 2026-10-02 — Motion-first; touch as an unranked assist mode
- **Alternatives:** Motion only; touch first with motion optional.
- **Why:** Pumping the phone is the only thing that separates the game from touch climbers like Dyno and Climb!. The assist mode covers buses, beds and accessibility at near-zero cost because it shares the physics. To be validated by the prototype test.
- **Interview:**
  - Problem: phone-pumping is the differentiator, but doesn't work everywhere (bus, bed, accessibility)
  - Tradeoff: touch as an assist mode sharing the same physics, unranked to keep the leaderboard fair
  - Treated as a hypothesis: a playtest with fresh players decides if motion-first holds

## 2026-10-03 — Single Expo app with a top-level `sim/` folder, boundary enforced by tooling
- **Alternatives:** Sim as a plain subfolder (`src/sim/`) kept clean by convention only; an npm workspaces monorepo (`apps/mobile`, `packages/sim`) from day one.
- **Why:** The sim has to run unchanged on the server later, so it can't depend on React Native, and it has to replay identically on Hermes and V8. A monorepo would give a real package boundary, but it makes Metro and native modules more fragile, and there's no server to share code with yet. Instead, one ESLint override on `sim/**` blocks React Native and Expo imports, `Math.sin`/`cos`/`random`, `**`, and `Date`, and a separate `sim/tsconfig.json` with no DOM lib blocks `window` and `requestAnimationFrame`.
- **Interview:**
  - Problem: sim must give identical results on Hermes (phone) and V8 (server)
  - Tradeoff: skipped a monorepo (no server yet); enforced the boundary with tooling instead
  - How: lint bans engine imports and non-deterministic math; a separate tsconfig removes browser globals
  - Revisit if: the server exists, then extracting a package is a folder move

## 2026-10-03 — Blank TypeScript template, no Expo Router
- **Alternatives:** Default Expo template (Expo Router, file-based routing, tabs).
- **Why:** A game is mostly one full-screen canvas. The prototype needs two screens (sensor debug, pendulum), which a `useState` toggle handles. Router can be added when there's real navigation (menus, daily route, leaderboard).
- **Interview:**
  - Problem: a game is one full-screen canvas; the prototype has two debug screens
  - Tradeoff: skip routing infrastructure until there's something to navigate
  - Revisit if: menus, daily route and leaderboard screens exist

## 2026-10-03 — Install Reanimated now, as a Skia requirement (not a game loop decision)
- **Alternatives:** Patch Skia with `patch-package` to guard the bad line; point Metro at Skia's compiled `lib/module` build instead of `src`.
- **Why:** Skia 2.6.2 lists Reanimated as optional, but `src/external/reanimated/useVideoLoading.ts` calls `Rea.createWorkletRuntime` at module top level, so importing `Canvas` throws "react-native-reanimated is not installed". Expo Go pins Skia 2.6.2 and already bundles Reanimated 4.5.1 + worklets 0.10.1, so installing them costs no native work. Patching or resolver tricks would mean maintaining fixes in a library we don't own. The game loop still starts on the JS thread; that open decision is unchanged.
- **Interview:**
  - Problem: a dependency declared "optional" was actually required, and the app crashed on import
  - Debugging: traced the error to an unguarded top-level call in the library's source, not our code
  - Tradeoff: took the supported path (two extra deps, already in Expo Go) over patching a third-party library
  - Revisit if: Skia fixes the guard upstream and we still don't use Reanimated

## 2026-10-03 — Animated drawing: rAF loop on the JS thread writes to a shared value; Skia redraws from it
- **Alternatives:** `requestAnimationFrame` + `setState` every frame; Skia's `useFrameCallback` worklet on the UI thread.
- **Why:** `setState` per frame re-renders React ~60 times a second, which is the thing CLAUDE.md rules out. Worklets would make the open loop-thread decision early and force sensor data across threads. Writing an `SkPath` into a Reanimated shared value lets Skia redraw without a React render while all logic stays plain JS on the JS thread. React state is only used for text readouts, throttled to 4 Hz. First used by the sensor debug screen; step 3's sim loop will follow the same pattern.
- **Interview:**
  - Problem: draw 60 fps animation in React Native without React re-rendering every frame
  - Tradeoff: game loop stays plain JS on the JS thread; React only owns layout and slow-changing text
  - Data path: sensor events → preallocated ring buffer → rAF reads it → shared value → Skia redraws
  - Revisit if: the JS thread janks under load; then move the loop to UI-thread worklets

## 2026-10-06 — Up and down is the main pump; both phone axes feed the pivot
- **Superseded 2026-10-06** by "A real dyno: spring legs, rope arms" below. Kept for the history.
- **Alternatives:** Vertical only, with every swing started for the player (catch momentum, angled start); sideways as the main pump with vertical as a later bonus.
- **Why:** Vertical matches a real dyno (sag and pull) and is how I want the game to feel. But vertical pivot motion is parametric pumping: it amplifies an existing swing at twice the swing frequency and can't start one from rest, so vertical-only would feel dead after any stop. Feeding the phone's full 2D acceleration into the pivot is the yo-yo model taken literally, costs one line in the step, and lets natural sideways wobble start the swing. Separate gains per axis let vertical be the strong one.
- **Interview:**
  - Problem: the motion I wanted as the core input physically can't start a swing from rest
  - Approach: model the phone as a 2D moving pivot, so one physics step handles both axes with no modes or special cases
  - Tradeoff: two gains to tune and a less obvious rhythm (twice per swing), in exchange for a mechanic that matches real climbing
  - Revisit if: playtesters can't find the vertical rhythm without explanation

## 2026-10-06 — Sim in SI units, integer-quantized inputs held per frame
- **Alternatives:** Pixels as sim units; interpolating the ~100 Hz sensor up to the 120 Hz sim; feeding raw floats into the sim.
- **Why:** Meters and seconds make constants physical (gravity 9.81, a 0.5 m arm gives a 1.42 s swing, phone m/s² feeds straight in) and independent of screen size; the renderer owns the px-per-meter scale. Inputs are quantized to integers at 0.01 m/s² (clamped to ±20 m/s²) before entering the sim, so a run is a list of small integers the server can replay bit-for-bit. The newest sample is held for every step in a frame; the 100 vs 120 Hz gap doesn't justify interpolation code yet. Headless tests confirmed the period matches theory and identical inputs give bit-identical state.
- **Interview:**
  - Problem: the physics must replay identically on a server from a recorded run
  - Approach: the sim never sees floats from outside; inputs are quantized integers, the timestep is fixed, and the only math is + - * / and sqrt
  - Tradeoff: 0.01 m/s² resolution and sample-and-hold latency (up to one frame), in exchange for a tiny, exact replay format
  - Revisit if: the swing feels steppy or laggy on device, then interpolate before quantizing

## 2026-10-06 — A real dyno: spring legs, rope arms, the phone drives the hips
- **Partly superseded 2026-10-06:** the legs, rope arms and front view stand; "phone acceleration drives the legs" was replaced by "the hips follow the phone's movement" below.
- **Alternatives:** Keep the moving-pivot pendulum and tune it; a full Verlet ragdoll with jointed limbs.
- **Why:** Playing the pendulum showed it's a campus swing, not a dyno, and sideways pumping felt wrong (it reacts in the opposite direction, and natural hand shakes are faster than a 1.4 s swing). A real dyno is a vertical bounce from hands and feet, so the body is one point mass on a one-sided leg spring, held by a pull-only rope arm, with phone up/down driving the legs. It starts from rest, matches the real movement, and keeps the sim tiny. A ragdoll looks better but would multiply tuning before we know pumping is fun; it can be a later visual layer. Most of step 3a (sensors, quantized input, loop, tuning panel, shared-value drawing) carries over.
- **Interview:**
  - Problem: the first prototype was physically correct but modeled the wrong movement; playtesting it myself caught that
  - Approach: pick the smallest physics model of the real movement (one mass, a one-sided spring, a rope) and fake the limbs in rendering
  - Tradeoff: less visual realism now, in exchange for fast tuning and a deterministic sim that's easy to replay
  - Revisit if: the stick figure reads as fake once the bounce feels right, then add a ragdoll on top

## 2026-10-06 — Front view camera
- **Alternatives:** Side view; a hybrid.
- **Why:** In a dyno the important motion is vertical, and front view shows the wall, the next hold and the up/down bounce directly. Side view shows body angle better but hides left/right aim. Settles an open decision as a consequence of the dyno model.
- **Interview:**
  - Problem: the camera decides which motion the player can read
  - Tradeoff: front view shows height and aim clearly but flattens body lean, which the stick figure poses fake
  - Revisit if: players can't tell when they're at the top of the drive

## 2026-10-06 — Sim tests on Node's built-in runner, no test framework
- **Alternatives:** Vitest.
- **Why:** The sim is dependency-free TypeScript, so Node 22 can run it directly (`--experimental-strip-types`) with `node:test`. The cost is explicit `.ts` endings on imports inside `sim/` (allowed via `allowImportingTsExtensions`; Metro resolves them fine). Tests get Node's types from a separate `sim/tsconfig.test.json`, so sim code itself still can't touch Node or DOM globals. Vitest's watch mode and nicer output aren't worth a dependency at six tests.
- **Interview:**
  - Problem: test physics headlessly without dragging a framework into a package meant to run on a server
  - Approach: Node's built-in test runner on the raw TS; tests assert behavior (rest, rhythm, constraints, determinism), not numbers copied from a run
  - Tradeoff: plainer tooling and `.ts` import endings, in exchange for zero dependencies
  - Revisit if: the suite grows enough that watch mode and snapshot tooling pay off

## 2026-10-06 — Normalize sensor sign at the single point where sensor data enters the app
- **Alternatives:** Flip signs in the sim or in the physics gains; leave it and let players adapt.
- **Why:** Left/right felt flipped on device. Expo passes platform values through, and iOS CoreMotion `userAcceleration` is the negative of the device's acceleration while Android's `TYPE_LINEAR_ACCELERATION` isn't, so every iOS input (vertical too) was backwards. Fixing it in `src/sensors/phoneAccel.ts` keeps one convention everywhere downstream (positive = phone accelerating right/up) and keeps platform details out of the sim, which has to replay identically on a server.
- **Interview:**
  - Problem: the same API returned opposite signs on iOS and Android, and the docs didn't say so
  - Approach: found it by reading the native module source, then normalized at the one boundary where sensor data enters
  - Tradeoff: one platform branch in the app, in exchange for a sim that never knows which phone it ran on
  - Revisit if: Expo normalizes this upstream, which would double-flip it

## 2026-10-06 — The hips follow the phone's movement (leaky double integration), not its acceleration
- **Sideways part superseded 2026-10-06** by "Tilt controls the lean" below; vertical still works this way.
- **Alternatives:** Keep acceleration as a force (tune it more); tilt controls position (orientation has no drift).
- **Why:** Acceleration-as-force made one downward swing produce a dip *and* a bounce (the phone speeds up, then slows down), so movements cancelled out and felt wrong. Players think in position: phone down = squat. The sensor only gives acceleration and pure double integration drifts, so a leaky integrator (decay over ~0.4 s) estimates displacement; the hips spring toward rest + follow × displacement through the legs. Liftoff emerges from momentum: a fast upward swing carries the hips past full leg extension, a slow one doesn't. Tilt was more direct but drops "move your phone like your body". Cost: a squat can't be held, and the leak causes a small rebound after each move.
- **Interview:**
  - Problem: the control felt wrong because the sensor measures acceleration but players think in position
  - Approach: leaky double integration to estimate displacement without drift; the body chases that target with spring-like legs
  - Tradeoff: no held positions and a slight rebound, in exchange for direct, drift-free control
  - Revisit if: players want to hold a crouch; then blend in phone tilt as the slow, absolute component

## 2026-10-06 — Tilt controls the lean; vertical stays movement-based
- **Alternatives:** Keep sideways on leaky-integrated movement (like vertical); tilt for both axes.
- **Why:** On device, sideways movement still felt off: the leak makes leans fade and rebound, and sideways swings are short and jerky. Tilt is absolute (gravity direction), so a held tilt holds the lean with no drift, rebound or integration. The input is gravity's x component (9.81 × sin(tilt)), a plain sensor value that's quantized like the others, so the sim needs no trig; Expo already reports it with the same sign on both platforms. Vertical stays movement-based because "phone down = squat, flick up = jump" is the core of the dyno feel, and tilt can't express a jump.
- **Interview:**
  - Problem: one control scheme for both axes felt wrong because the axes serve different purposes (aim vs power)
  - Approach: absolute tilt for steady aim, movement for explosive power; both reach the sim as quantized m/s², with no trig
  - Tradeoff: two input models to explain, in exchange for each axis feeling direct
  - Revisit if: players tilt by accident while pumping; then add a deadzone or a lean-only-when-planted rule

## 2026-10-06 — Vertical input is "up in the room", projected against gravity
- **Alternatives:** Also feed the wrist's pitch rotation rate (gyroscope) into the jump; treat motion toward the body as upward drive.
- **Why:** A pan-flip motion didn't register because vertical was read along the phone's long axis, and the flick rotates the phone, moving the upward push onto the screen-normal axis we ignored. Projecting the 3-axis acceleration onto −gravity gives world-up for any orientation, with a dot product and one sqrt. It runs in the sensor module before quantizing, so the sim still records one number per step. The gyro and toward-body options add signals and false triggers; they're the next step only if flips still feel weak.
- **Interview:**
  - Problem: the input was measured in the phone's frame, so rotating gestures lost their signal
  - Approach: transform to the world frame using the gravity vector the sensor already provides; one dot product, no trig
  - Tradeoff: one more transform at the sensor boundary, in exchange for every orientation and gesture working the same
  - Revisit if: flips still feel weak; then add the wrist's rotation rate as extra drive

## 2026-10-06 — Stop the wobble: forget only while still, and PD-damp the hips toward the target
- **Reverted 2026-10-06:** felt much worse on device; rolled back. Kept for the history: headless numbers improved but the feel didn't, so playtesting on the phone is the judge.
- **Alternatives:** Stronger global damping; a slower velocity leak; a zero-velocity update on top of the leaky integrator.
- **Why:** Measured headlessly after a dip-and-return: the estimate overshot 4 cm (the leak forgets the dip while you're in it, so the return reads as an upward move) and the hips overshot 7.7 cm and crossed neutral 3 times (damping ratio ~0.1). Fix 1: integrate faithfully while moving and only reset when the phone is still (velocity → 0 after ~80 ms of quiet, position eases back over 0.3 s), with caps against drift during nonstop shaking. Fix 2: PD control, damping toward the target's velocity at ratio 1, which kills overshoot without slowing a flick (global damping would sap jumps). Result: 0.7 cm overshoot, flick still lifts off. Cost: very slow moves can look like stillness and undercount.
- **Interview:**
  - Problem: "wobbly" was two bugs stacked: an estimator that rebounded and a controller tuned at damping ratio 0.1
  - Approach: measured both headlessly, then used a zero-velocity update (from pedestrian navigation) and PD control relative to the target
  - Tradeoff: slow moves undercount, in exchange for no rebound and no wobble
  - Revisit if: players use slow, deliberate squats; then lower the stillness threshold or blend in tilt

## 2026-10-06 — Fix the post-swing wobble only once the phone is still
- **Alternatives:** The reverted version (forget only while still + PD damping), which changed in-swing behavior; stronger damping everywhere (would sap jumps and change the feel).
- **Why:** The previous attempt changed how the climber moves *during* a swing and felt much worse, so this one leaves every in-swing line untouched. Measured on the restored model, the wobble was after the swing: 11 back-and-forth crossings over 2.3 s after a flick. Once the phone has been quiet for ~80 ms: drop the estimate's leftover velocity (the cause of the swing-back), return to neutral faster (0.25 s), and damp the legs harder (0.85). Result: no crossings, settled in 0.78 s; squat depth, peak and liftoff identical to before. A new test pins it.
- **Interview:**
  - Problem: a fix that improved every metric made the game feel worse, because it changed the part players were happy with
  - Approach: rolled back, then constrained the fix to the phase with the complaint (after the swing), and verified normal-speed swings were unchanged (a very slow move can still trip the "still" check mid-move)
  - Tradeoff: a mode switch (moving vs still) with its own two parameters, in exchange for not touching the feel players liked
  - Revisit if: the switch is noticeable as a "snap" when the phone stops; then blend the damping in over ~100 ms
