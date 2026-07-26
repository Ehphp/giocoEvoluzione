import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['artifacts/catalog-search/automatic-game-designer.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
})
