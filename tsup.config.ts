import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  dts: true,
  sourcemap: true,
  target: "es2022",
  treeshake: false,
  splitting: false,
};

export default defineConfig([
  {
    // The framework-free core: no React, nothing touched at import time.
    ...shared,
    entry: { index: "src/index.ts" },
    clean: true,
    platform: "browser",
  },
  {
    // The React kit imports the core by its package name, so a page holding
    // both entry points shares one copy of it (one tool registry, one load).
    ...shared,
    entry: { "react/index": "src/react/index.ts" },
    platform: "browser",
    external: [
      "@bookingbutler/widget",
      "react",
      "react-dom",
      "react/jsx-runtime",
    ],
    banner: { js: '"use client";' },
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
]);
