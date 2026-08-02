// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'

const mocks = vi.hoisted(() => ({
    createConceptKey: vi.fn<() => string>(),
    createImageKey: vi.fn<() => string>(),
    generateConcept: vi.fn(),
    generateImage: vi.fn(),
    getStatus: vi.fn(),
}))

vi.mock('../../lib/creature-transformations-api', () => ({
    createConceptIdempotencyKey: mocks.createConceptKey,
    createImageIdempotencyKey: mocks.createImageKey,
    generateCreatureTransformationConcept: mocks.generateConcept,
    generateCreatureTransformationImage: mocks.generateImage,
    getCreatureTransformationRequestStatus: mocks.getStatus,
    CreatureTransformationApiError: class CreatureTransformationApiError extends Error {},
}))

const creature = { id: 'creature-1', profile_id: 'profile-1', base_creature_key: 'VERDANT_HATCHLING', name: 'Creatura', level: 1, experience: 0, progression_state: {}, created_at: '', updated_at: '' }
const concept = {
    success: true as const, requestId: 'concept-1', identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(),
    evaluation: { acceptable: true, identityRisk: 'LOW' as const, transformationStrength: 'BALANCED' as const, problems: [] },
    prompt: composeCreatureTransformationPrompt({ identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(), renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION }),
    generation: { generator: 'mock', isMock: true, attempts: 1, latencyMs: 1 },
    requestPersistence: { transformationRequestId: 'concept-record', idempotencyStatus: 'CREATED' as const, status: 'SUCCEEDED' as const },
}

describe('CreatureTransformationLab real image pilot UI', () => {
    let container: HTMLDivElement

    beforeEach(() => {
        vi.resetModules()
        vi.stubEnv('VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED', 'true')
        mocks.createConceptKey.mockReset().mockReturnValue('concept-key')
        mocks.createImageKey.mockReset().mockReturnValue('real-key')
        mocks.generateConcept.mockReset().mockResolvedValue(concept)
        mocks.generateImage.mockReset().mockResolvedValue({ success: true, accepted: true, requestId: 'real-http-1', requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000001', idempotencyStatus: 'CREATED', status: 'RUNNING', estimatedCostUsd: 0.12 } })
        mocks.getStatus.mockReset().mockResolvedValue({
            success: true, requestId: 'status-http-1',
            requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000001', status: 'SUCCEEDED', createdAt: '2026-08-02T12:00:00.000Z', completedAt: '2026-08-02T12:00:01.000Z', estimatedCostUsd: 0.12 },
            generation: { provider: 'openai-image-api', model: 'configured-image-model', providerRequestId: 'openai-request-1', latencyMs: 20, estimatedCostUsd: 0.12 },
            result: { signedUrl: 'https://signed.example/real.png', expiresAt: '2026-08-02T12:05:00.000Z', width: 1024, height: 1536, mimeType: 'image/png', sha256: 'b'.repeat(64), assetReadiness: 'EXPERIMENT_ONLY', warnings: ['RAW_RESULT_ALPHA_MISSING'] },
        })
        container = document.createElement('div')
        document.body.append(container)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        container.remove()
    })

    it('requires cost confirmation, starts one REAL request and renders the terminal experiment-only status', async () => {
        const { CreatureTransformationLab } = await import('./CreatureTransformationLab')
        const root = createRoot(container)
        const button = (label: string) => {
            const found = [...container.querySelectorAll('button')].find((element) => element.textContent === label)
            if (!found) throw new Error(`button ${label} not found`)
            return found as HTMLButtonElement
        }
        await act(async () => { root.render(createElement(CreatureTransformationLab, { creature, onBack: () => undefined })) })
        await act(async () => { button('Genera concept').click() })
        const realButton = button('Genera immagine sperimentale')
        expect(realButton.disabled).toBe(true)
        await act(async () => { (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click() })
        expect(button('Genera immagine sperimentale').disabled).toBe(false)
        await act(async () => { button('Genera immagine sperimentale').click() })

        expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ imageProviderMode: 'REAL', idempotencyKey: 'real-key' }))
        expect(mocks.getStatus).toHaveBeenCalledWith({ operation: 'GET_REQUEST_STATUS', transformationRequestId: '00000000-0000-4000-8000-000000000001' })
        expect(container.textContent).toContain('Risultato sperimentale: non sostituisce ancora la creatura del profilo.')
        expect(container.textContent).toContain('EXPERIMENT_ONLY')
        expect(container.textContent).toContain('RAW_RESULT_ALPHA_MISSING')
        await act(async () => root.unmount())
    })
})
