import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['artifacts/game-mechanics-solver/exact-best-response.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
