// Deterministic simulation. Plain TypeScript only: no React Native, Expo, clock or
// transcendental Math. Lint (eslint.config.js) and sim/tsconfig.json enforce this.

/** Fixed simulation timestep in seconds (120 Hz), independent of frame rate. */
export const DT = 1 / 120;
