import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['projects/host-gemini-voice/src/app/profile-regression.spec.ts'],
  },
});