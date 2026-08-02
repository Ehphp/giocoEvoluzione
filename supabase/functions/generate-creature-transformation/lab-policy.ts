import type { GenerateConceptRequest } from '../../../shared/creature-transformations/contracts.ts'

type ConceptMode = GenerateConceptRequest['conceptMode']

const CONCEPT_MODES = new Set<ConceptMode>(['MOCK', 'AI'])

export type CreatureTransformationLabPolicy = Readonly<{
    enabled: boolean
    allowedConceptModes: ReadonlySet<ConceptMode>
}>

export function readCreatureTransformationLabPolicy(readEnvironment: (name: string) => string | undefined): CreatureTransformationLabPolicy {
    const enabled = readEnvironment('CREATURE_TRANSFORMATION_LAB_ENABLED') === 'true'
    const allowedConceptModes = new Set<ConceptMode>()
    const configuredModes = readEnvironment('CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES') ?? ''

    for (const mode of configuredModes.split(',')) {
        const normalized = mode.trim().toUpperCase()
        if (CONCEPT_MODES.has(normalized as ConceptMode)) {
            allowedConceptModes.add(normalized as ConceptMode)
        }
    }

    return Object.freeze({ enabled, allowedConceptModes })
}

