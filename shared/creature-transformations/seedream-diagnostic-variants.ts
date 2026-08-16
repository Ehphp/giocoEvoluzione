/**
 * Server-owned variants for the isolated Seedream diagnostic.  The first three
 * entries preserve the original replay modes; the latter two compare concept
 * source while keeping the same deterministic locked shell.
 */
export type SeedreamDiagnosticVariantId =
    | 'FIXED_FULL_PROMPT'
    | 'FIXED_MICRO_CONCEPT'
    | 'REAL_MICRO_CONCEPT'
    | 'fixed-concept-locked-prompt'
    | 'dynamic-concept-locked-prompt'

export type SeedreamDiagnosticConceptSource = 'fixed' | 'dynamic' | null
export type SeedreamDiagnosticPromptStrategy = 'fixedFullPrompt' | 'microConceptFluxV7' | 'lockedDynamic'

export type SeedreamDiagnosticVariant = Readonly<{
    variantId: SeedreamDiagnosticVariantId
    conceptSource: SeedreamDiagnosticConceptSource
    promptStrategy: SeedreamDiagnosticPromptStrategy
}>

export const SEEDREAM_DIAGNOSTIC_VARIANT_BY_ID: Readonly<Record<SeedreamDiagnosticVariantId, SeedreamDiagnosticVariant>> = Object.freeze({
    FIXED_FULL_PROMPT: Object.freeze({ variantId: 'FIXED_FULL_PROMPT', conceptSource: null, promptStrategy: 'fixedFullPrompt' }),
    FIXED_MICRO_CONCEPT: Object.freeze({ variantId: 'FIXED_MICRO_CONCEPT', conceptSource: 'fixed', promptStrategy: 'microConceptFluxV7' }),
    REAL_MICRO_CONCEPT: Object.freeze({ variantId: 'REAL_MICRO_CONCEPT', conceptSource: 'dynamic', promptStrategy: 'microConceptFluxV7' }),
    'fixed-concept-locked-prompt': Object.freeze({ variantId: 'fixed-concept-locked-prompt', conceptSource: 'fixed', promptStrategy: 'lockedDynamic' }),
    'dynamic-concept-locked-prompt': Object.freeze({ variantId: 'dynamic-concept-locked-prompt', conceptSource: 'dynamic', promptStrategy: 'lockedDynamic' }),
})

export function isSeedreamDiagnosticVariantId(value: unknown): value is SeedreamDiagnosticVariantId {
    return typeof value === 'string' && value in SEEDREAM_DIAGNOSTIC_VARIANT_BY_ID
}

export function seedreamDiagnosticVariant(value: SeedreamDiagnosticVariantId): SeedreamDiagnosticVariant {
    return SEEDREAM_DIAGNOSTIC_VARIANT_BY_ID[value]
}
