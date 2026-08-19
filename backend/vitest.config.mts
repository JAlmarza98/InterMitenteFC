import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts"],
    fileParallelism: false,
    reporters: ["default", "json"],
    outputFile: { json: "./test-results.json" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/scripts/**"],
    },
  },
});
