import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) =>
  fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@bookingbutler\/widget\/react$/,
        replacement: src("react/index.ts"),
      },
      { find: /^@bookingbutler\/widget$/, replacement: src("index.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    setupFiles: ["tests/setup.ts"],
  },
});
