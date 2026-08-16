import { composeFluxEvolutionPrompt, composeLockedDynamicFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import { createFluxEvolutionSnapshot, type FluxMicroConcept, type FluxEvolutionSnapshot } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import {
    seedreamDiagnosticVariant,
    type SeedreamDiagnosticVariantId,
} from '../../../shared/creature-transformations/seedream-diagnostic-variants.ts'
import {
    FAL_SEEDREAM_MODEL,
    FalFluxImageProvider,
    FalFluxImageProviderError,
    inferFalImageMimeType,
    type FalImageMimeType,
    type FalSeedreamDiagnosticGenerationResult,
    type FalSeedreamParameters,
} from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'

export type SeedreamDiagnosticMode = SeedreamDiagnosticVariantId
export type SeedreamDiagnosticChainMode = 'NONE' | 'RAW_PROVIDER_CHAIN' | 'NORMALIZED_PROJECT_CHAIN'

export type SeedreamDiagnosticSource = Readonly<{
    bytes: Uint8Array
    mimeType: FalImageMimeType
    sha256: string
    width: number
    height: number
}>

export type SeedreamDiagnosticRun = Readonly<{
    prompt: string
    promptSha256: string
    promptTemplateVersion: 'seedream-fixed-full-v1' | 'flux-micro-v7' | 'seedream-locked-dynamic-v1'
    conceptSnapshot: FluxEvolutionSnapshot | null
    source: SeedreamDiagnosticSource
    generation: FalSeedreamDiagnosticGenerationResult
}>

export type SeedreamDiagnosticResult = Readonly<{
    runs: readonly SeedreamDiagnosticRun[]
    finalRun: SeedreamDiagnosticRun
}>

export type SeedreamDiagnosticErrorCode = 'SEEDREAM_DIAGNOSTIC_SOURCE_INVALID' | 'SEEDREAM_DIAGNOSTIC_INPUT_INVALID' | 'SEEDREAM_DIAGNOSTIC_MODEL_REQUIRED'

export class SeedreamDiagnosticError extends Error {
    constructor(readonly code: SeedreamDiagnosticErrorCode, message: string) {
        super(message)
        this.name = 'SeedreamDiagnosticError'
    }
}

function readUint32(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function pngDimensions(bytes: Uint8Array): { width: number, height: number } | null {
    if (bytes.length < 24) return null
    const width = readUint32(bytes, 16)
    const height = readUint32(bytes, 20)
    return width > 0 && height > 0 ? { width, height } : null
}

function jpegDimensions(bytes: Uint8Array): { width: number, height: number } | null {
    let offset = 2
    while (offset + 8 <= bytes.length) {
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
        const marker = bytes[offset++]
        if (marker === undefined || marker === 0xd9 || marker === 0xda) return null
        if (marker >= 0xd0 && marker <= 0xd7) continue
        if (offset + 1 >= bytes.length) return null
        const length = (bytes[offset] << 8) + bytes[offset + 1]
        if (length < 7 || offset + length > bytes.length) return null
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
            const height = (bytes[offset + 3] << 8) + bytes[offset + 4]
            const width = (bytes[offset + 5] << 8) + bytes[offset + 6]
            return width > 0 && height > 0 ? { width, height } : null
        }
        offset += length
    }
    return null
}

function imageDimensions(bytes: Uint8Array, mimeType: FalImageMimeType): { width: number, height: number } | null {
    return mimeType === 'image/png' ? pngDimensions(bytes) : jpegDimensions(bytes)
}

function decodeBase64(value: string): Uint8Array | null {
    if (!value.length || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
    try {
        const binary = atob(value)
        return Uint8Array.from(binary, (character) => character.charCodeAt(0))
    } catch {
        return null
    }
}

export async function readSeedreamDiagnosticSource(input: { base64: string, mimeType: FalImageMimeType }): Promise<SeedreamDiagnosticSource> {
    const bytes = decodeBase64(input.base64)
    const actualMimeType = bytes ? inferFalImageMimeType(bytes) : null
    if (!bytes || actualMimeType !== input.mimeType) {
        throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_SOURCE_INVALID', 'La sorgente diagnostica non corrisponde al MIME dichiarato o non e PNG/JPEG valido.')
    }
    const dimensions = imageDimensions(bytes, actualMimeType)
    if (!dimensions) throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_SOURCE_INVALID', 'Non e possibile leggere le dimensioni reali della sorgente diagnostica.')
    return Object.freeze({ bytes, mimeType: actualMimeType, sha256: await sha256Hex(bytes), ...dimensions })
}

function conceptSnapshot(concept: FluxMicroConcept | null, plan: FluxEvolutionPlan, providerSeed: number | undefined): FluxEvolutionSnapshot | null {
    if (!concept) return null
    return createFluxEvolutionSnapshot({
        ...concept,
        evolutionTargetId: plan.evolutionTargetId,
        evolutionFunction: plan.evolutionFunction,
        capability: plan.capability,
        ...(plan.bodyPlanMutationId ? { bodyPlanMutationId: plan.bodyPlanMutationId } : {}),
        resultBodyPlanId: plan.resultBodyPlanId,
        ...(providerSeed === undefined ? {} : { providerSeed }),
    })
}

async function composePrompt(input: {
    mode: SeedreamDiagnosticMode
    fixedFullPrompt?: string
    fixedMicroConcept?: FluxMicroConcept
    generator: FluxMicroConceptGenerator
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
}): Promise<{ prompt: string, promptTemplateVersion: SeedreamDiagnosticRun['promptTemplateVersion'], concept: FluxMicroConcept | null }> {
    const variant = seedreamDiagnosticVariant(input.mode)
    if (variant.promptStrategy === 'fixedFullPrompt') {
        if (!input.fixedFullPrompt?.trim()) throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_INPUT_INVALID', 'Il Test A richiede un prompt completo fisso non vuoto.')
        return { prompt: input.fixedFullPrompt, promptTemplateVersion: 'seedream-fixed-full-v1', concept: null }
    }
    const concept = variant.conceptSource === 'fixed'
        ? input.mode === 'fixed-concept-locked-prompt' ? SEEDREAM_LOCKED_ANTLER_CONCEPT : input.fixedMicroConcept
        : await input.generator.generate({ identity: input.identity, plan: input.plan })
    if (!concept) throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_INPUT_INVALID', 'Il test diagnostico richiede un concept valido.')
    if (variant.promptStrategy === 'lockedDynamic') {
        return {
            prompt: composeLockedDynamicFluxEvolutionPrompt({
                identity: input.identity,
                anatomyContract: input.plan.anatomyContract,
                microConcept: concept,
                framingAttempt: 0,
            }),
            promptTemplateVersion: 'seedream-locked-dynamic-v1',
            concept,
        }
    }
    return {
        prompt: composeFluxEvolutionPrompt({ identity: input.identity, anatomyContract: input.plan.anatomyContract, microConcept: concept, lineage: input.plan.lineage, framingAttempt: 0 }),
        promptTemplateVersion: 'flux-micro-v7',
        concept,
    }
}

/** Prepares one diagnostic request without invoking or downloading from Fal. */
export async function prepareSeedreamDiagnosticPrompt(input: {
    experimentMode: SeedreamDiagnosticMode
    fixedFullPrompt?: string
    fixedMicroConcept?: FluxMicroConcept
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    microConceptGenerator: FluxMicroConceptGenerator
}): Promise<Readonly<{
    prompt: string
    promptSha256: string
    promptTemplateVersion: SeedreamDiagnosticRun['promptTemplateVersion']
    conceptSnapshot: FluxEvolutionSnapshot | null
}>> {
    const composed = await composePrompt({
        mode: input.experimentMode,
        fixedFullPrompt: input.fixedFullPrompt,
        fixedMicroConcept: input.fixedMicroConcept,
        generator: input.microConceptGenerator,
        identity: input.identity,
        plan: input.plan,
    })
    return Object.freeze({
        prompt: composed.prompt,
        promptSha256: await sha256Hex(new TextEncoder().encode(composed.prompt)),
        promptTemplateVersion: composed.promptTemplateVersion,
        conceptSnapshot: conceptSnapshot(composed.concept, input.plan, undefined),
    })
}

/** Server-owned baseline for Test D; browser input cannot alter this comparison concept. */
export const SEEDREAM_LOCKED_ANTLER_CONCEPT: FluxMicroConcept = Object.freeze({
    conceptName: 'ORANGE VELVET JUVENILE ANTLERS',
    mutationIdea: 'Grow a clearly visible symmetrical pair of young ungulate-style antlers from the existing head crown, with broad living bases integrated into the skull.',
    visualDetails: Object.freeze([
        'moderately sized upward-growing antlers with simple rounded forks or early branches',
        'thick, rounded and youthful proportions rather than long sharp mature tines',
        'soft living orange-rust velvet covering with a fuzzy vascular organic surface',
        'the warm orange velvet remains clearly readable at normal gameplay scale',
        'keep the existing face, eyes and expression recognisable',
    ]),
    avoid: Object.freeze([
        'exposed white bone or dead antlers',
        'hard polished horns or sharp mature tines',
        'accessories, metal or artificial materials',
    ]),
})

function logRun(input: {
    internalRequestId: string
    transformationRequestId?: string
    experimentMode: SeedreamDiagnosticMode
    chainMode: SeedreamDiagnosticChainMode
    step: number
    sourceVisualVersionId?: string
    parameters: FalSeedreamParameters
    run: SeedreamDiagnosticRun
}) {
    console.info('seedream.diagnostic.summary', {
        internalRequestId: input.internalRequestId,
        ...(input.transformationRequestId ? { transformationRequestId: input.transformationRequestId } : {}),
        experimentMode: input.experimentMode,
        variantId: seedreamDiagnosticVariant(input.experimentMode).variantId,
        conceptSource: seedreamDiagnosticVariant(input.experimentMode).conceptSource,
        promptStrategy: seedreamDiagnosticVariant(input.experimentMode).promptStrategy,
        chainMode: input.chainMode,
        chainStep: input.step,
        model: input.run.generation.model,
        promptTemplateVersion: input.run.promptTemplateVersion,
        promptLength: input.run.prompt.length,
        promptSha256: input.run.promptSha256,
        promptPreview: input.run.prompt.slice(0, 400),
        sourceSha256: input.run.source.sha256,
        sourceMimeType: input.run.source.mimeType,
        sourceBytes: input.run.source.bytes.length,
        sourceWidth: input.run.source.width,
        sourceHeight: input.run.source.height,
        ...(input.sourceVisualVersionId ? { sourceVisualVersionId: input.sourceVisualVersionId } : {}),
        imageUrlTransportType: 'data-uri',
        providerRequestId: input.run.generation.providerRequestId,
        providerOutputMimeType: input.run.generation.providerOutputMimeType,
        storedResultMimeType: input.run.generation.storedResultMimeType,
        seed: input.parameters.seed ?? input.run.generation.seed,
        imageSize: input.parameters.imageSize,
        seedreamParameters: {
            image_size: input.parameters.imageSize,
            ...(input.parameters.numImages === undefined ? {} : { num_images: input.parameters.numImages }),
            ...(input.parameters.maxImages === undefined ? {} : { max_images: input.parameters.maxImages }),
            ...(input.parameters.seed === undefined ? {} : { seed: input.parameters.seed }),
            ...(input.parameters.syncMode === undefined ? {} : { sync_mode: input.parameters.syncMode }),
            ...(input.parameters.enableSafetyChecker === undefined ? {} : { enable_safety_checker: input.parameters.enableSafetyChecker }),
        },
        latencyMs: input.run.generation.latencyMs,
        cropRetryCount: 0,
        conceptSnapshot: input.run.conceptSnapshot,
    })
}

export async function runSeedreamDiagnostic(input: {
    internalRequestId: string
    transformationRequestId?: string
    experimentMode: SeedreamDiagnosticMode
    chainMode: SeedreamDiagnosticChainMode
    fixedFullPrompt?: string
    fixedMicroConcept?: FluxMicroConcept
    sourceVisualVersionId?: string
    source: SeedreamDiagnosticSource
    parameters: FalSeedreamParameters
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    provider: FalFluxImageProvider
    microConceptGenerator: FluxMicroConceptGenerator
}): Promise<SeedreamDiagnosticResult> {
    if (input.chainMode !== 'NONE' && input.chainMode !== 'RAW_PROVIDER_CHAIN' && input.chainMode !== 'NORMALIZED_PROJECT_CHAIN') {
        throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_INPUT_INVALID', 'La modalita della catena diagnostica non e valida.')
    }
    const runs: SeedreamDiagnosticRun[] = []
    let source = input.source
    const steps = input.chainMode === 'NONE' ? 1 : 2
    for (let step = 1; step <= steps; step += 1) {
        const composed = await composePrompt({
            mode: input.experimentMode,
            fixedFullPrompt: input.fixedFullPrompt,
            fixedMicroConcept: input.fixedMicroConcept,
            generator: input.microConceptGenerator,
            identity: input.identity,
            plan: input.plan,
        })
        let generation: FalSeedreamDiagnosticGenerationResult
        try {
            generation = await input.provider.transformSeedreamDiagnostic({
                prompt: composed.prompt,
                source: { bytes: source.bytes, mimeType: source.mimeType },
                parameters: input.parameters,
            })
        } catch (error) {
            if (error instanceof FalFluxImageProviderError) throw error
            if (error instanceof FluxMicroConceptGeneratorError) throw error
            throw error
        }
        if (generation.model !== FAL_SEEDREAM_MODEL) {
            throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_MODEL_REQUIRED', 'Il replay diagnostico ha usato un modello diverso da Seedream 4.5 Edit.')
        }
        const run: SeedreamDiagnosticRun = Object.freeze({
            prompt: composed.prompt,
            promptSha256: await sha256Hex(new TextEncoder().encode(composed.prompt)),
            promptTemplateVersion: composed.promptTemplateVersion,
            conceptSnapshot: conceptSnapshot(composed.concept, input.plan, generation.seed),
            source,
            generation,
        })
        runs.push(run)
        logRun({
            internalRequestId: input.internalRequestId,
            transformationRequestId: input.transformationRequestId,
            experimentMode: input.experimentMode,
            chainMode: input.chainMode,
            step,
            sourceVisualVersionId: input.sourceVisualVersionId,
            parameters: input.parameters,
            run,
        })
        if (step < steps) {
            const nextBytes = input.chainMode === 'RAW_PROVIDER_CHAIN' ? generation.rawProviderImage : generation.image
            const nextMimeType = input.chainMode === 'RAW_PROVIDER_CHAIN' ? generation.providerOutputMimeType : 'image/png'
            const dimensions = imageDimensions(nextBytes, nextMimeType)
            if (!dimensions) throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_SOURCE_INVALID', 'Il primo output non puo essere riutilizzato come sorgente della catena.')
            source = Object.freeze({ bytes: nextBytes, mimeType: nextMimeType, sha256: await sha256Hex(nextBytes), ...dimensions })
        }
    }
    const finalRun = runs.at(-1)
    if (!finalRun) throw new SeedreamDiagnosticError('SEEDREAM_DIAGNOSTIC_INPUT_INVALID', 'Il replay diagnostico non ha prodotto alcuna run.')
    return Object.freeze({ runs: Object.freeze(runs), finalRun })
}

