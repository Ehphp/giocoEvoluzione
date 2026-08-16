import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { composeFluxEvolutionPrompt, composeLockedDynamicFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import { FAL_SEEDREAM_MODEL } from './fal-flux-image-provider.ts'
import { createResolvedCreatureSource } from './test-creature-fixtures.ts'
import { readSeedreamDiagnosticSource, runSeedreamDiagnostic, SEEDREAM_LOCKED_ANTLER_CONCEPT } from './seedream-diagnostic-service.ts'

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
}

function jpegFixture(): Uint8Array {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9])
}

async function source() {
    const bytes = createTestPng({ width: 1024, height: 1536 })
    return readSeedreamDiagnosticSource({ base64: base64(bytes), mimeType: 'image/png' })
}

function plan(evolutionTargetId: 'DORSAL_STRUCTURES' | 'HEAD_AND_CROWN' = 'DORSAL_STRUCTURES') {
    const resolved = createResolvedCreatureSource()
    if (!resolved.bodyPlan) throw new Error('Missing body plan')
    return {
        identity: resolved.identity,
        plan: buildFluxEvolutionPlan({
            bodyPlan: resolved.bodyPlan,
            evolutionTargetId,
            previousTransformations: [],
            seed: 'seedream-diagnostic-test',
            bodyPlanMutationEnabled: false,
            adoptedBodyPlanMutationIds: [],
        }),
    }
}

function provider(outputs: Array<{ raw?: Uint8Array, rawMime?: 'image/png' | 'image/jpeg' }> = []) {
    const transformSeedreamDiagnostic = vi.fn(async () => {
        const next = outputs.shift() ?? {}
        return {
            image: createTestPng({ width: 1920, height: 2880 }),
            rawProviderImage: next.raw ?? createTestPng({ width: 1920, height: 2880 }),
            providerOutputMimeType: next.rawMime ?? 'image/png',
            storedResultMimeType: 'image/png' as const,
            provider: 'fal.ai' as const,
            model: FAL_SEEDREAM_MODEL,
            providerRequestId: 'fal-diagnostic-request',
            latencyMs: 7,
        }
    })
    return { transformSeedreamDiagnostic }
}

const PARAMETERS = { imageSize: { width: 1920, height: 2880 }, numImages: 1, maxImages: 1, seed: 77, enableSafetyChecker: true } as const
const FIXED_CONCEPT = { conceptName: 'Cresta ventaglio', mutationIdea: 'Una cresta dorsale a ventaglio cresce tra le spine esistenti.', visualDetails: ['lamelle sovrapposte'] } as const
const DYNAMIC_LOCKED_CONCEPT = {
    conceptName: 'TEST_DYNAMIC_MUTATION_123',
    mutationIdea: 'Grow a broad pair of living crown fins from the existing skull.',
    visualDetails: ['rounded organic fins', 'warm vascular surface'],
    avoid: ['artificial accessories'],
} as const

function withoutMutation(prompt: string) {
    const start = prompt.indexOf('\n\nNEW MUTATION —')
    const end = prompt.indexOf('\n\nBIOLOGICAL PRIOR')
    return `${prompt.slice(0, start)}${prompt.slice(end)}`
}

describe('Seedream diagnostic service', () => {
    it('records actual PNG/JPEG source metadata and rejects a MIME lie', async () => {
        const png = await source()
        expect(png).toMatchObject({ mimeType: 'image/png', width: 1024, height: 1536 })
        expect(png.sha256).toMatch(/^[a-f0-9]{64}$/)

        const jpeg = await readSeedreamDiagnosticSource({ base64: base64(jpegFixture()), mimeType: 'image/jpeg' })
        expect(jpeg).toMatchObject({ mimeType: 'image/jpeg', width: 3, height: 2 })
        await expect(readSeedreamDiagnosticSource({ base64: base64(jpegFixture()), mimeType: 'image/png' }))
            .rejects.toMatchObject({ code: 'SEEDREAM_DIAGNOSTIC_SOURCE_INVALID' })
    })

    it('keeps the creative boundary exact for Tests A through E', async () => {
        const replaySource = await source()
        const model = plan()

        const providerA = provider()
        const generatorA = { generate: vi.fn() }
        const resultA = await runSeedreamDiagnostic({
            internalRequestId: 'request-a',
            experimentMode: 'FIXED_FULL_PROMPT',
            chainMode: 'NONE',
            fixedFullPrompt: 'EXACT PLAYGROUND PROMPT',
            source: replaySource,
            parameters: PARAMETERS,
            identity: model.identity,
            plan: model.plan,
            provider: providerA as never,
            microConceptGenerator: generatorA as never,
        })
        expect(generatorA.generate).not.toHaveBeenCalled()
        expect(providerA.transformSeedreamDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'EXACT PLAYGROUND PROMPT' }))
        expect(resultA.finalRun.promptTemplateVersion).toBe('seedream-fixed-full-v1')
        expect(resultA.finalRun.conceptSnapshot).toBeNull()

        const providerB = provider()
        const generatorB = { generate: vi.fn() }
        const resultB = await runSeedreamDiagnostic({
            internalRequestId: 'request-b',
            experimentMode: 'FIXED_MICRO_CONCEPT',
            chainMode: 'NONE',
            fixedMicroConcept: FIXED_CONCEPT,
            source: replaySource,
            parameters: PARAMETERS,
            identity: model.identity,
            plan: model.plan,
            provider: providerB as never,
            microConceptGenerator: generatorB as never,
        })
        expect(generatorB.generate).not.toHaveBeenCalled()
        expect(resultB.finalRun.promptTemplateVersion).toBe('flux-micro-v7')
        expect(resultB.finalRun.prompt).toBe(composeFluxEvolutionPrompt({
            identity: model.identity,
            anatomyContract: model.plan.anatomyContract,
            microConcept: FIXED_CONCEPT,
            lineage: model.plan.lineage,
            framingAttempt: 0,
        }))

        const providerC = provider()
        const generatorC = { generate: vi.fn(async () => FIXED_CONCEPT) }
        const resultC = await runSeedreamDiagnostic({
            internalRequestId: 'request-c',
            experimentMode: 'REAL_MICRO_CONCEPT',
            chainMode: 'NONE',
            source: replaySource,
            parameters: PARAMETERS,
            identity: model.identity,
            plan: model.plan,
            provider: providerC as never,
            microConceptGenerator: generatorC as never,
        })
        expect(generatorC.generate).toHaveBeenCalledTimes(1)
        expect(resultC.finalRun.promptTemplateVersion).toBe('flux-micro-v7')

        const lockedModel = plan('HEAD_AND_CROWN')
        const providerD = provider()
        const generatorD = { generate: vi.fn() }
        const resultD = await runSeedreamDiagnostic({
            internalRequestId: 'request-d',
            experimentMode: 'fixed-concept-locked-prompt',
            chainMode: 'NONE',
            source: replaySource,
            parameters: PARAMETERS,
            identity: lockedModel.identity,
            plan: lockedModel.plan,
            provider: providerD as never,
            microConceptGenerator: generatorD as never,
        })
        expect(generatorD.generate).not.toHaveBeenCalled()
        expect(resultD.finalRun.promptTemplateVersion).toBe('seedream-locked-dynamic-v1')
        expect(resultD.finalRun.prompt).toBe(composeLockedDynamicFluxEvolutionPrompt({
            identity: lockedModel.identity,
            anatomyContract: lockedModel.plan.anatomyContract,
            microConcept: SEEDREAM_LOCKED_ANTLER_CONCEPT,
            framingAttempt: 0,
        }))
        expect(resultD.finalRun.prompt).toContain('NEW MUTATION — ORANGE VELVET JUVENILE ANTLERS')
        expect(resultD.finalRun.conceptSnapshot).toMatchObject({ conceptName: SEEDREAM_LOCKED_ANTLER_CONCEPT.conceptName, evolutionTargetId: 'HEAD_AND_CROWN' })

        const providerE = provider()
        const generatorE = { generate: vi.fn(async () => DYNAMIC_LOCKED_CONCEPT) }
        const resultE = await runSeedreamDiagnostic({
            internalRequestId: 'request-e',
            experimentMode: 'dynamic-concept-locked-prompt',
            chainMode: 'NONE',
            source: replaySource,
            parameters: PARAMETERS,
            identity: lockedModel.identity,
            plan: lockedModel.plan,
            provider: providerE as never,
            microConceptGenerator: generatorE as never,
        })
        expect(generatorE.generate).toHaveBeenCalledTimes(1)
        expect(resultE.finalRun.promptTemplateVersion).toBe('seedream-locked-dynamic-v1')
        expect(resultE.finalRun.prompt).toBe(composeLockedDynamicFluxEvolutionPrompt({
            identity: lockedModel.identity,
            anatomyContract: lockedModel.plan.anatomyContract,
            microConcept: DYNAMIC_LOCKED_CONCEPT,
            framingAttempt: 0,
        }))
        expect(resultE.finalRun.prompt).toContain('NEW MUTATION — TEST_DYNAMIC_MUTATION_123')
        expect(resultE.finalRun.prompt).not.toContain('ORANGE VELVET JUVENILE ANTLERS')
        expect(withoutMutation(resultD.finalRun.prompt)).toBe(withoutMutation(resultE.finalRun.prompt))
        expect(resultE.finalRun.conceptSnapshot).toMatchObject({ conceptName: DYNAMIC_LOCKED_CONCEPT.conceptName, evolutionTargetId: 'HEAD_AND_CROWN' })
    })

    it('uses raw provider bytes or the normalized PNG as the second chain source and never logs base64', async () => {
        const rawJpeg = jpegFixture()
        const normalizedPng = createTestPng({ width: 1920, height: 2880 })
        const replaySource = await source()
        const model = plan()
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        const rawProvider = provider([{ raw: rawJpeg, rawMime: 'image/jpeg' }, { raw: normalizedPng }])
        await runSeedreamDiagnostic({
            internalRequestId: 'raw-chain',
            experimentMode: 'FIXED_FULL_PROMPT',
            chainMode: 'RAW_PROVIDER_CHAIN',
            fixedFullPrompt: 'CHAIN PROMPT',
            source: replaySource,
            parameters: PARAMETERS,
            identity: model.identity,
            plan: model.plan,
            provider: rawProvider as never,
            microConceptGenerator: { generate: vi.fn() } as never,
        })
        expect(rawProvider.transformSeedreamDiagnostic.mock.calls[1]![0].source).toEqual({ bytes: rawJpeg, mimeType: 'image/jpeg' })

        const normalizedProvider = provider([{ raw: rawJpeg, rawMime: 'image/jpeg' }, { raw: normalizedPng }])
        await runSeedreamDiagnostic({
            internalRequestId: 'normalized-chain',
            experimentMode: 'FIXED_FULL_PROMPT',
            chainMode: 'NORMALIZED_PROJECT_CHAIN',
            fixedFullPrompt: 'CHAIN PROMPT',
            source: replaySource,
            parameters: PARAMETERS,
            identity: model.identity,
            plan: model.plan,
            provider: normalizedProvider as never,
            microConceptGenerator: { generate: vi.fn() } as never,
        })
        expect(normalizedProvider.transformSeedreamDiagnostic.mock.calls[1]![0].source).toEqual({ bytes: createTestPng({ width: 1920, height: 2880 }), mimeType: 'image/png' })
        const summaries = consoleInfo.mock.calls.filter(([event]) => event === 'seedream.diagnostic.summary')
        expect(summaries).toHaveLength(4)
        expect(JSON.stringify(summaries)).not.toContain(base64(replaySource.bytes))
        expect(JSON.stringify(summaries)).toContain('"providerOutputMimeType":"image/jpeg"')
        consoleInfo.mockRestore()
    })
})

