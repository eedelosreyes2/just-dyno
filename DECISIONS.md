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
