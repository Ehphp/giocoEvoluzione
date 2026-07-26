import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['artifacts/game-mechanics-audit/simulation.test.ts'],
        environment: 'node',
        reporters: ['default'],
    },
})
