import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(__dirname, "src") };
const testDb = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/aitoolbox_test";

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], env: { MOCK_AI: "true" } },
      },
      {
        resolve: { alias },
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          globalSetup: ["tests/e2e/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          env: {
            DATABASE_URL: testDb,
            MOCK_AI: "true",
            ALLOW_PRIVATE_FETCH: "true",
            MEDIA_DIR: path.resolve(__dirname, ".test-media"),
            REVALIDATE_SECRET: "",
          },
        },
      },
    ],
  },
});
