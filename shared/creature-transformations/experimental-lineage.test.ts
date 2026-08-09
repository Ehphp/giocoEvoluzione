import { describe, expect, it } from 'vitest'
import { composeLineageFirstPrompt } from './experimental-lineage.ts'
import { TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'

describe('lineage-first prompt', () => {
    it('preserves recorded lineage without prescribing a current-pipeline trait or intensity', () => {
        const prompt = composeLineageFirstPrompt({ identity: TEST_CREATURE_IDENTITY, evolutionTargetId: 'TAIL', lineage: { identityTraits: ['emerald scales'], acquiredTraits: [{ target: 'TAIL', description: 'segmented tail fins' }, { target: 'SKIN', description: 'bioluminescent markings' }] } })
        expect(prompt).toContain('segmented tail fins')
        expect(prompt).toContain('develop what is visibly there')
        expect(prompt).toContain('Preserve the past, do not prescribe the future')
        expect(prompt).toContain('opaque PNG')
        expect(prompt).not.toContain('transparent PNG')
        expect(prompt).not.toContain('visualTrait')
        expect(prompt).not.toContain('intensity')
    })
})
