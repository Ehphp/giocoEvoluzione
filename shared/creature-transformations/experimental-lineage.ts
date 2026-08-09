import type { EvolutionTargetId } from './evolution-targets.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from './evolution-targets.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from './render-specifications.ts'

/** Intentionally small and editable: this is experiment context, never production state. */
export type ExperimentalLineage = Readonly<{
    identityTraits: readonly string[]
    acquiredTraits: readonly { target?: EvolutionTargetId, description: string }[]
}>

export type LineageFirstPromptInput = Readonly<{
    identity: CreatureSemanticIdentity
    lineage: ExperimentalLineage
    evolutionTargetId: EvolutionTargetId
    instruction?: string
}>

function clean(items: readonly string[], maximum: number): string[] {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, maximum)
}

export function normalizeExperimentalLineage(value: ExperimentalLineage): ExperimentalLineage {
    return Object.freeze({
        identityTraits: Object.freeze(clean(value.identityTraits, 16)),
        acquiredTraits: Object.freeze(value.acquiredTraits
            .map((trait) => ({ ...(trait.target ? { target: trait.target } : {}), description: trait.description.trim() }))
            .filter((trait) => trait.description.length > 0 && trait.description.length <= 500)
            .slice(0, 24)),
    })
}

/** "Preserve the past, do not prescribe the future" prompt used only by the admin experiment. */
export function composeLineageFirstPrompt(input: LineageFirstPromptInput): string {
    const target = EVOLUTION_TARGET_BY_ID[input.evolutionTargetId]
    const lineage = normalizeExperimentalLineage(input.lineage)
    const identity = clean([...input.identity.identityFeatures, ...lineage.identityTraits], 24)
    const acquired = lineage.acquiredTraits.map((trait) => `${trait.target ? `${EVOLUTION_TARGET_BY_ID[trait.target].label}: ` : ''}${trait.description}`)
    return [
        'LINEAGE-FIRST EXPERIMENTAL ADMIN GENERATION. This image is experiment-only and must never be treated as a production visual.',
        'Edit the supplied source image. It is the same creature and the same individual, not a new character.',
        `Creature identity to preserve: ${identity.join('; ') || input.identity.description}.`,
        `Selected anatomical target: ${target.label} (${target.description}). Make this the dominant, unmistakable transformation.`,
        acquired.length ? `Acquired mutations that must survive visibly: ${acquired.join('; ')}.` : 'There are no prior acquired mutations recorded yet.',
        'Preserve the past, do not prescribe the future. Be creative and surprising: invent a strong, potentially radical development of the selected target. Do not settle for decorative variation.',
        'If the selected target has already evolved, develop what is visibly there; do not replace it with an unrelated new idea.',
        'Keep characteristic non-target traits stable. Keep the same graphic style, pose, composition, framing, and technical game-ready silhouette. Do not alter unrelated anatomy without a compelling consequence of the selected target.',
        input.instruction?.trim() ? `Optional administrator direction: ${input.instruction.trim()}.` : '',
        `Technical output: ${CURRENT_CREATURE_RENDER_SPECIFICATION.width}x${CURRENT_CREATURE_RENDER_SPECIFICATION.height}, opaque PNG, isolated creature on a plain solid background for post-processing, no text, no objects, no environmental scene.`,
    ].filter(Boolean).join('\n\n')
}
