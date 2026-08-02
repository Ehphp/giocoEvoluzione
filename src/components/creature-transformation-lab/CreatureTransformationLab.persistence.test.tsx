// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import type { GenerateConceptResponse, GenerateImageResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'

const mocks = vi.hoisted(() => {
    class TestApiError extends Error {
        readonly code: string
        readonly requestId?: string
        readonly requestPersistence?: unknown

        constructor(response: { code: string; message: string; requestId?: string; requestPersistence?: unknown }) {
            super(response.message)
            this.name = 'CreatureTransformationApiError'
            this.code = response.code
            this.requestId = response.requestId
            this.requestPersistence = response.requestPersistence
        }
    }
    return {
        createConceptIdempotencyKey: vi.fn<() => string>(),
        createImageIdempotencyKey: vi.fn<() => string>(),
        generateConcept: vi.fn(),
        generateImage: vi.fn(),
        TestApiError,
    }
})

vi.mock('../../lib/creature-transformations-api', () => ({
    createConceptIdempotencyKey: mocks.createConceptIdempotencyKey,
    createImageIdempotencyKey: mocks.createImageIdempotencyKey,
    generateCreatureTransformationConcept: mocks.generateConcept,
    generateCreatureTransformationImage: mocks.generateImage,
    CreatureTransformationApiError: mocks.TestApiError,
}))

import { CreatureTransformationLab } from './CreatureTransformationLab'

const creature = {
    id: 'creature-1', profile_id: 'profile-1', base_creature_key: 'VERDANT_HATCHLING', name: 'Creatura iniziale',
    level: 1, experience: 0, progression_state: {}, created_at: '', updated_at: '',
}

const conceptSuccess: GenerateConceptResponse = {
    success: true, requestId: 'concept-http-1', identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(),
    evaluation: { acceptable: true, identityRisk: 'LOW', transformationStrength: 'BALANCED', problems: [] },
    prompt: composeCreatureTransformationPrompt({ identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(), renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION }),
    generation: { generator: 'mock-concept', isMock: true, attempts: 1, latencyMs: 1 },
    requestPersistence: { transformationRequestId: 'concept-record-1', idempotencyStatus: 'CREATED', status: 'SUCCEEDED', estimatedCostUsd: 0, actualCostUsd: 0 },
}

const imageSuccess: GenerateImageResponse = {
    success: true, requestId: 'image-http-1',
    result: { signedUrl: 'https://signed.example/image.png', expiresAt: '2026-08-02T18:00:00.000Z', mimeType: 'image/png', width: 1024, height: 1536, sha256: 'a'.repeat(64), assetReadiness: 'FINAL_ASSET' },
    generation: { provider: 'mock-image', model: 'copy-v1', isMock: true, latencyMs: 2, estimatedCostUsd: 0 },
    validation: { warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'] },
    requestPersistence: { transformationRequestId: 'image-record-1', idempotencyStatus: 'EXISTING', status: 'SUCCEEDED', estimatedCostUsd: 0, actualCostUsd: 0 },
}

let container: HTMLDivElement
let root: Root

function button(label: string): HTMLButtonElement {
    const found = [...container.querySelectorAll('button')].find((entry) => entry.textContent === label)
    if (!found) throw new Error(`button ${label} not found`)
    return found as HTMLButtonElement
}

async function renderLab() {
    await act(async () => {
        root.render(createElement(CreatureTransformationLab, { creature, onBack: () => undefined }))
    })
}

beforeEach(async () => {
    mocks.createConceptIdempotencyKey.mockReset()
    mocks.createImageIdempotencyKey.mockReset()
    mocks.generateConcept.mockReset()
    mocks.generateImage.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await renderLab()
})

afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

describe('CreatureTransformationLab persistence UI', () => {
    it('shows persisted metadata and a recovered mock result without exposing its internal path', async () => {
        mocks.createConceptIdempotencyKey.mockReturnValue('concept-click-1')
        mocks.createImageIdempotencyKey.mockReturnValue('image-click-1')
        mocks.generateConcept.mockResolvedValue(conceptSuccess)
        mocks.generateImage.mockResolvedValue(imageSuccess)

        await act(async () => { button('Genera concept').click() })
        expect(mocks.generateConcept).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'concept-click-1' }))
        expect(container.textContent).toContain('concept-record-1')
        expect(container.textContent).toContain('SUCCEEDED (CREATED)')

        await act(async () => { button('Genera immagine mock').click() })
        expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'image-click-1' }))
        expect(container.textContent).toContain('image-record-1')
        expect(container.textContent).toContain('SUCCEEDED (EXISTING)')
        expect(container.textContent).toContain('Costo effettivo')
        expect(container.textContent).not.toContain('profile-1/')
    })

    it('blocks a duplicate click while busy, reuses the technical retry key and creates a new key for a later intentional click', async () => {
        let resolveFirst: ((value: GenerateConceptResponse) => void) | null = null
        mocks.createConceptIdempotencyKey.mockReturnValueOnce('technical-retry-key').mockReturnValueOnce('new-intentional-key')
        mocks.generateConcept
            .mockImplementationOnce(() => new Promise<GenerateConceptResponse>((resolve) => { resolveFirst = resolve }))
            .mockResolvedValueOnce(conceptSuccess)

        await act(async () => { button('Genera concept').click() })
        expect(button('Genero concept...').disabled).toBe(true)
        button('Genero concept...').click()
        expect(mocks.generateConcept).toHaveBeenCalledTimes(1)
        expect(mocks.generateConcept).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'technical-retry-key' }))

        await act(async () => { resolveFirst?.(conceptSuccess) })
        await act(async () => { button('Genera concept').click() })
        expect(mocks.generateConcept.mock.calls.map(([value]) => value.idempotencyKey)).toEqual(['technical-retry-key', 'new-intentional-key'])

        mocks.createConceptIdempotencyKey.mockReset().mockReturnValue('retry-same-key')
        mocks.generateConcept.mockReset().mockRejectedValueOnce(new mocks.TestApiError({
            code: 'MOCK_PROVIDER_FAILED', message: 'Provider non disponibile.', requestId: 'failed-http-1',
            requestPersistence: { transformationRequestId: 'failed-record-1', idempotencyStatus: 'CREATED', status: 'FAILED' },
        })).mockResolvedValueOnce(conceptSuccess)
        await act(async () => { button('Genera concept').click() })
        expect(container.textContent).toContain('MOCK_PROVIDER_FAILED')
        expect(container.textContent).toContain('failed-record-1')
        await act(async () => { button('Riprova tecnicamente').click() })
        expect(mocks.generateConcept.mock.calls.map(([value]) => value.idempotencyKey)).toEqual(['retry-same-key', 'retry-same-key'])
    })

    it.each(['DAILY_LIMIT_REACHED', 'DAILY_BUDGET_REACHED', 'REQUEST_ALREADY_IN_PROGRESS', 'REQUEST_PREVIOUSLY_FAILED', 'REQUEST_STALE'])(
        'shows %s without offering a misleading technical retry',
        async (code) => {
            mocks.createConceptIdempotencyKey.mockReturnValue(`key-${code}`)
            mocks.generateConcept.mockRejectedValue(new mocks.TestApiError({
                code, message: `Errore ${code}`, requestId: 'blocked-http-1',
                requestPersistence: { transformationRequestId: 'blocked-record-1', idempotencyStatus: 'EXISTING', status: 'FAILED' },
            }))

            await act(async () => { button('Genera concept').click() })
            expect(container.textContent).toContain(code)
            expect(container.textContent).toContain('blocked-record-1')
            expect([...container.querySelectorAll('button')].some((entry) => entry.textContent === 'Riprova tecnicamente')).toBe(false)
        },
    )
})
