// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Math functions whose results can differ between Hermes (phone) and V8 (server).
// The sim must replay identically on both, so only + - * / and Math.sqrt are allowed.
const NON_DETERMINISTIC_MATH = [
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "exp", "expm1", "log", "log1p", "log2", "log10",
  "pow", "cbrt", "hypot", "random",
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // sim/ must stay portable (shared with the server later) and deterministic.
    files: ["sim/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["react", "react-*", "react-native", "react-native-*", "expo", "expo-*", "@expo/*", "@shopify/*"],
          message: "sim/ must not import React, React Native or Expo. Keep it plain TypeScript.",
        }],
      }],
      "no-restricted-properties": ["error",
        ...NON_DETERMINISTIC_MATH.map((property) => ({
          object: "Math",
          property,
          message: "Not deterministic across JS engines. Use + - * / and Math.sqrt only (see CLAUDE.md).",
        })),
      ],
      "no-restricted-globals": ["error",
        { name: "Date", message: "The sim must not read the clock. Time comes from the fixed timestep." },
        { name: "performance", message: "The sim must not read the clock. Time comes from the fixed timestep." },
      ],
      "no-restricted-syntax": ["error", {
        selector: "BinaryExpression[operator='**']",
        message: "** is Math.pow under the hood. Multiply explicitly (x * x).",
      }],
    },
  },
]);
