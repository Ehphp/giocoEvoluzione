/** Server-controlled creative policy for the structured concept stage. */
export const CONCEPT_CREATIVE_PROFILE_IDS = Object.freeze(['CONSERVATIVE', 'EXPRESSIVE'] as const)

export type ConceptCreativeProfileId = (typeof CONCEPT_CREATIVE_PROFILE_IDS)[number]

export const DEFAULT_CONCEPT_CREATIVE_PROFILE: ConceptCreativeProfileId = 'CONSERVATIVE'

export function isConceptCreativeProfileId(value: unknown): value is ConceptCreativeProfileId {
    return typeof value === 'string' && (CONCEPT_CREATIVE_PROFILE_IDS as readonly string[]).includes(value)
}

export function conceptPromptTemplateVersion(profile: ConceptCreativeProfileId): 'creature-transformation-v2-experimental' | 'creature-transformation-v3-expressive' {
    return profile === 'EXPRESSIVE' ? 'creature-transformation-v3-expressive' : 'creature-transformation-v2-experimental'
}
