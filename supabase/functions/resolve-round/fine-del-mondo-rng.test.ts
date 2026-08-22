import { describe, expect, it } from 'vitest'

import { drawFineDelMondoOutcome } from './fine-del-mondo-rng.ts'

describe('FINE_DEL_MONDO RNG', () => {
    const input = {
        secret: 'test-only-server-secret',
        gameId: 'game-1',
        roundNumber: 3,
        playerId: 'player-1',
        mutationId: 'FINE_DEL_MONDO' as const,
        ruleVersion: 'combat-mutations-fine-del-mondo-v1',
    }

    it('is deterministic for a retry of the same server-authoritative draw', async () => {
        await expect(drawFineDelMondoOutcome(input)).resolves.toBe(await drawFineDelMondoOutcome(input))
    })

    it('returns only a persisted FINE_DEL_MONDO outcome', async () => {
        await expect(drawFineDelMondoOutcome({ ...input, playerId: 'player-2' })).resolves.toMatch(/^(FINE_DEL_MONDO|ERA_PROSPERA)$/)
    })
})
