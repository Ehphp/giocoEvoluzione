import type { FalSeedreamParameters } from './fal-flux-image-provider.ts'
import type { SeedreamDiagnosticChainMode, SeedreamDiagnosticMode } from './seedream-diagnostic-service.ts'
import {
    isSeedreamDiagnosticVariantId,
    seedreamDiagnosticVariant,
    type SeedreamDiagnosticConceptSource,
    type SeedreamDiagnosticPromptStrategy,
    type SeedreamDiagnosticVariantId,
} from '../../../shared/creature-transformations/seedream-diagnostic-variants.ts'

export type FalQueueSource = Readonly<{
    kind: 'CANONICAL' | 'EXPERIMENTAL' | 'VISUAL'
    path: string
    isBaseVersion: boolean
}>

export type FalQueueWorkflow = Readonly<{
    version: 1
    kind: 'FLUX'
    source: FalQueueSource
}> | Readonly<{
    version: 1
    kind: 'SEEDREAM_DIAGNOSTIC'
    chainMode: SeedreamDiagnosticChainMode
    chainStep: 1 | 2
    experimentMode: SeedreamDiagnosticMode
    variantId: SeedreamDiagnosticVariantId
    conceptSource: SeedreamDiagnosticConceptSource
    promptStrategy: SeedreamDiagnosticPromptStrategy
    parameters: FalSeedreamParameters
}>

function object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function source(value: unknown): FalQueueSource | null {
    const item = object(value)
    if (!item || (item.kind !== 'CANONICAL' && item.kind !== 'EXPERIMENTAL' && item.kind !== 'VISUAL') || typeof item.path !== 'string' || !item.path || item.path.length > 512 || typeof item.isBaseVersion !== 'boolean') return null
    return Object.freeze({ kind: item.kind, path: item.path, isBaseVersion: item.isBaseVersion })
}

function parameters(value: unknown): FalSeedreamParameters | null {
    const item = object(value)
    if (!item || !('imageSize' in item)) return null
    const imageSize = item.imageSize
    const validNamedSize = imageSize === 'square_hd' || imageSize === 'square' || imageSize === 'portrait_4_3' || imageSize === 'portrait_16_9' || imageSize === 'landscape_4_3' || imageSize === 'landscape_16_9' || imageSize === 'auto_2K' || imageSize === 'auto_4K'
    const size = object(imageSize)
    const validDimensions = size && typeof size.width === 'number' && Number.isInteger(size.width) && typeof size.height === 'number' && Number.isInteger(size.height) && size.width > 0 && size.height > 0
    const number = (field: 'numImages' | 'maxImages' | 'seed') => item[field] === undefined || (typeof item[field] === 'number' && Number.isInteger(item[field]) && item[field] >= 0)
    if ((!validNamedSize && !validDimensions) || !number('numImages') || !number('maxImages') || !number('seed') || (item.syncMode !== undefined && typeof item.syncMode !== 'boolean') || (item.enableSafetyChecker !== undefined && typeof item.enableSafetyChecker !== 'boolean')) return null
    return Object.freeze({
        imageSize: validDimensions ? { width: size.width as number, height: size.height as number } : imageSize as FalSeedreamParameters['imageSize'],
        ...(typeof item.numImages === 'number' ? { numImages: item.numImages } : {}),
        ...(typeof item.maxImages === 'number' ? { maxImages: item.maxImages } : {}),
        ...(typeof item.seed === 'number' ? { seed: item.seed } : {}),
        ...(typeof item.syncMode === 'boolean' ? { syncMode: item.syncMode } : {}),
        ...(typeof item.enableSafetyChecker === 'boolean' ? { enableSafetyChecker: item.enableSafetyChecker } : {}),
    })
}

export function parseFalQueueWorkflow(value: unknown): FalQueueWorkflow | null {
    const item = object(value)
    if (!item || item.version !== 1) return null
    if (item.kind === 'FLUX') {
        const parsedSource = source(item.source)
        return parsedSource ? Object.freeze({ version: 1, kind: 'FLUX', source: parsedSource }) : null
    }
    if (item.kind === 'SEEDREAM_DIAGNOSTIC') {
        const parsedParameters = parameters(item.parameters)
        if (!parsedParameters || (item.chainMode !== 'NONE' && item.chainMode !== 'RAW_PROVIDER_CHAIN' && item.chainMode !== 'NORMALIZED_PROJECT_CHAIN') || (item.chainStep !== 1 && item.chainStep !== 2) || !isSeedreamDiagnosticVariantId(item.experimentMode)) return null
        const variant = seedreamDiagnosticVariant(item.experimentMode)
        // Fields were added after the first diagnostic releases. Deriving their
        // values keeps an in-flight legacy chain finalizable, while rejecting
        // any persisted metadata that contradicts its selected variant. D/E used
        // `lockedFullPrompt` before their concept was interpolated; normalize that
        // historical label to the current lockedDynamic strategy for finalization.
        const legacyLockedStrategy = item.promptStrategy === 'lockedFullPrompt' && variant.promptStrategy === 'lockedDynamic'
        if ((item.variantId !== undefined && item.variantId !== variant.variantId) || (item.conceptSource !== undefined && item.conceptSource !== variant.conceptSource) || (item.promptStrategy !== undefined && item.promptStrategy !== variant.promptStrategy && !legacyLockedStrategy)) return null
        return Object.freeze({
            version: 1,
            kind: 'SEEDREAM_DIAGNOSTIC',
            chainMode: item.chainMode,
            chainStep: item.chainStep,
            experimentMode: item.experimentMode,
            variantId: variant.variantId,
            conceptSource: variant.conceptSource,
            promptStrategy: variant.promptStrategy,
            parameters: parsedParameters,
        })
    }
    return null
}
