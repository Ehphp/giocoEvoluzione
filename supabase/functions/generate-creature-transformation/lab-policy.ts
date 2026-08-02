import type { GenerateConceptRequest, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'

type ConceptMode = GenerateConceptRequest['conceptMode']
type ImageProviderMode = GenerateImageRequest['imageProviderMode']

const CONCEPT_MODES = new Set<ConceptMode>(['MOCK', 'AI'])
const IMAGE_PROVIDER_MODES = new Set<ImageProviderMode>(['MOCK'])
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300

export type CreatureTransformationLabPolicy = Readonly<{
    enabled: boolean
    allowedConceptModes: ReadonlySet<ConceptMode>
    allowedImageProviderModes: ReadonlySet<ImageProviderMode>
    signedUrlTtlSeconds: number
}>

export function readCreatureTransformationLabPolicy(readEnvironment: (name: string) => string | undefined): CreatureTransformationLabPolicy {
    const enabled = readEnvironment('CREATURE_TRANSFORMATION_LAB_ENABLED') === 'true'
    const allowedConceptModes = new Set<ConceptMode>()
    const allowedImageProviderModes = new Set<ImageProviderMode>()
    const configuredModes = readEnvironment('CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES') ?? ''
    const configuredImageModes = readEnvironment('CREATURE_TRANSFORMATION_ALLOWED_IMAGE_PROVIDER_MODES') ?? ''

    for (const mode of configuredModes.split(',')) {
        const normalized = mode.trim().toUpperCase()
        if (CONCEPT_MODES.has(normalized as ConceptMode)) {
            allowedConceptModes.add(normalized as ConceptMode)
        }
    }

    for (const mode of configuredImageModes.split(',')) {
        const normalized = mode.trim().toUpperCase()
        if (IMAGE_PROVIDER_MODES.has(normalized as ImageProviderMode)) {
            allowedImageProviderModes.add(normalized as ImageProviderMode)
        }
    }

    const configuredTtl = Number(readEnvironment('CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS'))
    const signedUrlTtlSeconds = Number.isInteger(configuredTtl) && configuredTtl >= 60 && configuredTtl <= 3600
        ? configuredTtl
        : DEFAULT_SIGNED_URL_TTL_SECONDS

    return Object.freeze({ enabled, allowedConceptModes, allowedImageProviderModes, signedUrlTtlSeconds })
}
