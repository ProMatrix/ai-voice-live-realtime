import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';

export default defineConfig({
  plugins: [angular()],
  resolve: {
    alias: {
      'llm-common': path.resolve(__dirname, 'projects/llm-common/src/public-api.ts'),
      'llm-google': path.resolve(__dirname, 'projects/llm-google/src/public-api.ts'),
      'llm-microsoft': path.resolve(__dirname, 'projects/llm-microsoft/src/public-api.ts'),
      'shared-ux': path.resolve(__dirname, 'projects/shared-ux/src/public-api.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['setup-vitest.ts'],
    include: ['projects/**/*.spec.ts'],
  },
});
