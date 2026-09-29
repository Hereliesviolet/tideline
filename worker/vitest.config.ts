import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./test/setup-tz.ts"],
    env: {
      JWT_SECRET: "test-secret-with-at-least-thirty-two-characters",
    },
  },
});
