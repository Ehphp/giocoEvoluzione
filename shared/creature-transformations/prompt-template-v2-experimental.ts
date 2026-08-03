import type { CreaturePromptSections, PromptTemplateV1Input } from './prompt-template-v1.ts'
import { composeCreatureTransformationPromptTemplateV1 } from './prompt-template-v1.ts'

export const CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL = 'creature-transformation-v2-experimental' as const

export function composeCreatureTransformationPromptTemplateV2Experimental(input: PromptTemplateV1Input): CreaturePromptSections {
    const v1 = composeCreatureTransformationPromptTemplateV1(input)
    const previous = input.previousTransformations?.length
        ? ` Preserve prior adopted transformations: ${input.previousTransformations.map((entry) => `v${entry.versionNumber} ${entry.visualTraitId} (${entry.conceptName})`).join('; ')}. Do not remove or repeat them.`
        : ''
    return {
        identity: `${v1.identity} Edit the provided source image; do not create a new character. Keep the same creature and the same individual.`,
        transformation: `${v1.transformation} Limit the mutation to the requested body areas and concept commitments only.${previous}`,
        preservation: `${v1.preservation} Keep the face and eyes unchanged unless the requested body area explicitly requires them. Keep the same pose, overall silhouette, and dominant palette.`,
        prohibitions: `${v1.prohibitions} Do not introduce global changes outside the concept. Do not create a new species or replace the anatomy.`,
        style: `${v1.style} Preserve the source image composition and visual identity without global reinterpretation.`,
        technical: v1.technical,
    }
}
