import { describe, expect, it } from 'vitest'

import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { generateConceptForAuthenticatedProfile } from './generation-service.ts'

describe('generateConceptForAuthenticatedProfile', () => {
    it('rejects a target direction with no compatible primary anatomy before calling the AI generator', async () => {
        let generated = 0
        const generator: CreatureConceptGenerator = {
            metadata: { generator: 'unexpected', isMock: false },
            async generateConcept() {
                generated += 1
                throw new Error('the generator must not run')
            },
        }
        const result = await generateConceptForAuthenticatedProfile({
            profileId: 'profile-1', requestId: 'request-1', generator,
            request: {
                operation: 'GENERATE_CONCEPT', creatureId: 'creature-1', visualTraitId: 'IMPACT_ADAPTATION',
                evolutionTargetId: 'HIND_LIMBS', evolutionFunction: 'DEFENSE', intensity: 2, conceptMode: 'AI', idempotencyKey: 'invalid-direction',
            },
            resolver: {
                async resolve() {
                    return {
                        identity: TEST_CREATURE_IDENTITY, sourceImagePath: 'source.png', sourceSha256: 'a'.repeat(64), sourceIsBaseVersion: true,
                        currentVisualVersionId: 'version-1', currentVersionNumber: 1, previousTransformations: [],
                    }
                },
            },
        })

        expect(result).toMatchObject({ success: false, code: 'CONCEPT_REJECTED', problems: [expect.objectContaining({ code: 'BODY_AREA_NOT_ALLOWED' })] })
        expect(generated).toBe(0)
    })
})