import { describe, expect, it } from 'vitest'

import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import { canGenerateMockImage } from './lab-image-state.ts'

const acceptedConcept = {
    success: true as const,
    requestId: 'request-1',
    identity: TEST_CREATURE_IDENTITY,
    concept: createValidConcept(),
    evaluation: { acceptable: true, identityRisk: 'LOW' as const, transformationStrength: 'BALANCED' as const, problems: [] },
    prompt: composeCreatureTransformationPrompt({ identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(), renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION }),
    generation: { generator: 'mock', isMock: true, attempts: 1, latencyMs: 1 },
    requestPersistence: { transformationRequestId: 'persisted-1', idempotencyStatus: 'CREATED' as const, status: 'SUCCEEDED' as const, estimatedCostUsd: 0, actualCostUsd: 0 },
}

describe('creature transformation lab image state', () => {
    it('permits the mock button only for an acceptable concept and no concurrent request', () => {
        expect(canGenerateMockImage(null, false, false)).toBe(false)
        expect(canGenerateMockImage({ ...acceptedConcept, evaluation: { ...acceptedConcept.evaluation, acceptable: false } }, false, false)).toBe(false)
        expect(canGenerateMockImage(acceptedConcept, true, false)).toBe(false)
        expect(canGenerateMockImage(acceptedConcept, false, true)).toBe(false)
        expect(canGenerateMockImage(acceptedConcept, false, false)).toBe(true)
    })
})
