import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'api/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
