import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Path aliases (@asm/*, @game/*) are read from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    testTimeout: 30000,
    maxWorkers: '100%',
    slowTestThreshold: 1000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/build.ts', 'src/game/fixed.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
