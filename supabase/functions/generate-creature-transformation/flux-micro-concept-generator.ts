import {
    parseFluxMicroConcept,
    type FluxMicroConcept,
} from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import {
    describeCurrentTargetState,
    type EvolutionLineageEntry,
} from '../../../shared/creature-transformations/flux-evolution/evolution-lineage.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import {
    EVOLUTION_FUNCTION_MICRO_CONCEPT_DESCRIPTIONS,
    EVOLUTION_TARGET_BY_ID,
} from '../../../shared/creature-transformations/evolution-targets.ts'

type FetchLike = typeof fetch

export type FluxMicroConceptGeneratorErrorCode =
    | 'FLUX_CONCEPT_NOT_CONFIGURED'
    | 'FLUX_CONCEPT_TIMEOUT'
    | 'FLUX_CONCEPT_PROVIDER_ERROR'
    | 'FLUX_CONCEPT_RESPONSE_INVALID'

export class FluxMicroConceptGeneratorError extends Error {
    constructor(
        readonly code: FluxMicroConceptGeneratorErrorCode,
        message: string,
        options?: { cause?: unknown },
    ) {
        super(message, options)
        this.name = 'FluxMicroConceptGeneratorError'
    }
}

export type FluxMicroConceptGeneratorOptions = Readonly<{
    apiKey: string
    model: string
    timeoutMs?: number
    fetchImplementation?: FetchLike
}>

export type GenerateFluxMicroConceptInput = Readonly<{
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    /** Observed-state continuity only; the selected target remains primary. */
    visualContinuity?: string | null
}>

const INDEPENDENT_APPENDAGE_PATTERN =
    /\b(?:independently rooted|independent(?:ly)?(?: rooted)?\s+(?:anatomical\s+)?appendages?|new\s+(?:anatomical\s+)?roots?|separate\s+(?:anatomical\s+)?appendages?)\b|\b(?:appendici\s+indipendenti|nuov[ea]\s+radici\s+anatomiche)\b/i
const ADDED_TOPOLOGY_PATTERN =
    /\b(?:additional|extra|new|second|multiple|several|independent|separate)\s+(?:tails?|tentacles?|limbs?|wings?|heads?|appendages?)\b|\b(?:code?|tentacol[ioe]|arti|zampe|ali|teste|appendici)\s+(?:aggiunt[ei]|extra|nuov[ei]|separat[ei]|indipendenti)\b/i
const TAIL_SPLIT_PATTERN =
    /\b(?:split|forked|bifurcated|branched)\s+tail\b|\btail\s+(?:splits?|forks?|bifurcates?|branches?)\b|\b(?:coda\s+(?:biforcat[ae]|divis[ae]|ramificat[ae])|(?:coda\s+)?(?:biforcat[ae]|divis[ae]|ramificat[ae])\s+in\s+(?:due|pi[ùu])\s+code?)\b|\b(?:tentacle|tentacolo)\b/i

/** Rejects model concepts that would contradict a normal target's fixed topology. */
export function isTopologicallyCompatibleFluxMicroConcept(concept: FluxMicroConcept, plan: FluxEvolutionPlan): boolean {
    if (plan.capability !== 'ANATOMICAL_MUTATION') return true
    const text = [concept.conceptName, concept.mutationIdea, ...concept.visualDetails].join(' ')
    if (INDEPENDENT_APPENDAGE_PATTERN.test(text) || ADDED_TOPOLOGY_PATTERN.test(text)) return false
    return plan.evolutionTargetId !== 'TAIL' || !TAIL_SPLIT_PATTERN.test(text)
}

const NOVELTY_STOP_WORDS = new Set([
    'the',
    'and',
    'with',
    'from',
    'this',
    'that',
    'into',
    'for',
    'its',
    'new',
    'existing',
    'creature',
    'mutation',
    'evolution',
    'la',
    'il',
    'lo',
    'le',
    'gli',
    'un',
    'una',
    'con',
    'del',
    'della',
    'delle',
    'nel',
    'nella',
    'che',
    'come',
    'per',
    'sulla',
    'sulle',
    'target',
    'body',
    'anatomy',
    'anatomical',
    'coda',
    'tail',
    'pelle',
    'skin',
    'testa',
    'head',
    'arti',
    'limbs',
    'wings',
    'ali',
])

function normaliseWords(value: string): Set<string> {
    return new Set(
        value
            .toLocaleLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length > 2 && !NOVELTY_STOP_WORDS.has(word)),
    )
}

function normalisePhrase(value: string): string {
    return [...normaliseWords(value)].sort().join(' ')
}

function referenceText(reference: EvolutionLineageEntry): string {
    return `${reference.conceptName} ${reference.mutationIdea ?? ''}`
}

/** Cheap deterministic guard for repeated morphology on the selected target only. */
export function isNovelFluxMicroConcept(concept: FluxMicroConcept, plan: FluxEvolutionPlan): boolean {
    const candidateText = `${concept.conceptName} ${concept.mutationIdea} ${concept.visualDetails.join(' ')}`
    const candidateWords = normaliseWords(candidateText)
    if (!candidateWords.size) return true
    return !plan.noveltyReferences.some((reference) => {
        const referenceWords = normaliseWords(referenceText(reference))
        const shared = [...candidateWords].filter((word) => referenceWords.has(word)).length
        const candidateMutation = normalisePhrase(concept.mutationIdea)
        const referenceMutation = normalisePhrase(reference.mutationIdea ?? '')
        if (candidateMutation && referenceMutation && candidateMutation === referenceMutation) return true
        return shared >= 2 && shared / candidateWords.size >= 0.67 && shared / Math.max(referenceWords.size, 1) >= 0.67
    })
}

function describeNoveltyReferences(references: readonly EvolutionLineageEntry[]): string {
    return references
        .map((reference) => `${reference.conceptName}${reference.mutationIdea ? ` (${reference.mutationIdea})` : ''}`)
        .join('; ')
}

function plural(count: number, singular: string, pluralForm: string): string {
    return count === 1 ? singular : pluralForm
}

function isTailStructuralMutation(plan: FluxEvolutionPlan): boolean {
    return (
        plan.evolutionTargetId === 'TAIL' &&
        plan.capability === 'BODY_PLAN_MUTATION' &&
        Boolean(plan.anatomyContract.structuralChange)
    )
}

function tailStructuralTopologyInstructions(plan: FluxEvolutionPlan): readonly string[] {
    const sourceCount = plan.anatomyContract.sourceTopology.tailCount
    const outputCount = plan.anatomyContract.resultTopology.tailCount
    return [
        'TAIL STRUCTURAL TOPOLOGY:',
        `SOURCE ANATOMY: The source creature currently has exactly ${sourceCount} ${plural(sourceCount, 'tail', 'tails')}.`,
        `AUTHORIZED TOPOLOGY CHANGE: Change exactly ${sourceCount} existing ${plural(sourceCount, 'tail', 'tails')} into ${outputCount} ${plural(outputCount, 'tail', 'tails')} sharing the original tail root.`,
        `OUTPUT ANATOMY: The final creature must have exactly ${outputCount} ${plural(outputCount, 'tail', 'tails')}, all clearly readable as tails and all rooted at the original tail attachment point.`,
    ]
}

export function composeFluxMicroConceptInstructions(
    input: GenerateFluxMicroConceptInput,
    retryForNovelty = false,
): string {
    const plan = input.plan
    const contract = plan.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[plan.evolutionTargetId]
    const structural = plan.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    const bodyShapePresentationLock =
        plan.evolutionTargetId === 'BODY_SHAPE' && plan.capability === 'ANATOMICAL_MUTATION'
    const tailPresentationLock = plan.evolutionTargetId === 'TAIL'
    const tailStructural = isTailStructuralMutation(plan)
    const secondaryAdaptationRule = tailPresentationLock
        ? 'Introduce a secondary adaptation only when it is necessary for local anatomical continuity, tail-root integration or tightly linked target material or colour propagation. A secondary adaptation must be subordinate, less visually prominent and clearly derived from the primary mutation; never add one by default, rebalance posture or change stance, redesign the torso or neck, or reposition limbs.'
        : bodyShapePresentationLock
          ? 'Introduce a secondary adaptation only when it is a necessary consequence of the primary mutation for biomechanical support, anatomical continuity, minimal proportion adjustment within the existing pose, structural integration or tightly linked visual propagation. A secondary adaptation must be subordinate, less visually prominent and clearly derived from the primary mutation; never add one by default, redesign unrelated anatomy or change pose, stance, facing, orientation, viewpoint or composition.'
          : 'Introduce a secondary adaptation only when it is a necessary consequence of the primary mutation for biomechanical support, anatomical continuity, posture rebalancing, structural integration or tightly linked visual propagation. A secondary adaptation must be subordinate, less visually prominent and clearly derived from the primary mutation; never add one by default or redesign unrelated anatomy.'
    const mutableAppearance = input.identity.mutableVisualFeatures.length
        ? input.identity.mutableVisualFeatures.join('; ')
        : 'current surface appearance and coloration'
    const functionalDescription = EVOLUTION_FUNCTION_MICRO_CONCEPT_DESCRIPTIONS[plan.evolutionFunction]
    const functionalDirection = functionalDescription
        ? `${plan.evolutionFunction} — ${functionalDescription}`
        : plan.evolutionFunction
    return [
        'Return one strict JSON FluxMicroConcept and nothing else.',
        'Invent one creature mutation that is visually distinctive, surprising, clearly readable at gameplay scale and anatomically integrated.',
        'FIELD ROLES: conceptName is a short visible morphology label, not the biological function. mutationIdea describes concrete anatomy: what grows or reshapes, where it originates or attaches, its main silhouette and the visually dominant transformation. visualDetails contains 1-5 non-overlapping concrete visual details covering, when relevant, proportions or arrangement, growth pattern, biological tissue or material, surface, target-linked colour and local anatomical integration. avoid contains only mutation-specific failure modes; do not include global camera, orientation, framing, background or anatomy rules.',
        `SELECTED TARGET: ${plan.evolutionTargetId} — ${target.promptRegion}. Treat it as the primary evolutionary target and default to a local mutation. If the mutation works on its own, describe only that target. Preserve all unrelated anatomy by default. ${secondaryAdaptationRule}`,
        ...(input.visualContinuity
            ? [
                  `VISUAL CONTINUITY (secondary repair context): ${input.visualContinuity}`,
                  'Use this only to preserve observed continuity or repair a confirmed or persistent visual defect when compatible with the selected target. The selected target remains the primary mutation; do not turn repair context into a second evolution.',
              ]
            : []),
        `TARGET FREEDOM: ${contract.targetAllowances.join(' ')}`,
        ...(tailPresentationLock
            ? [
                  'TAIL POSE AND BODY LOCK: Preserve the original pose and body plan. Do not make the creature taller, more upright, more serpentine or substantially elongated. Do not lengthen the neck, redesign the torso or reposition the limbs. A tail mutation does not authorize a posture or stance change.',
                  'TAIL LOCALITY AND INTEGRATION: Keep the mutation confined to the tail and the minimum local anatomical integration required at the tail root. Every resulting tail must read clearly as a tail, never as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages.',
                  'TAIL NON-TARGET PRESERVATION: Preserve the head, face, neck proportions, torso proportions, limb roots, limb placement, original stance and overall body presentation. Do not redesign the rest of the creature to present the tail mutation.',
              ]
            : []),
        ...(bodyShapePresentationLock
            ? [
                  'BODY-SHAPE PRESENTATION LOCK: Reshape the trunk strongly through morphology while preserving the same base pose, viewpoint, facing direction, overall orientation and composition. Do not describe a new stance, camera angle, rotation, tilt or re-staging as part of this mutation.',
              ]
            : []),
        ...(tailStructural
            ? tailStructuralTopologyInstructions(plan)
            : [
                  'TOPOLOGY: For a normal anatomical mutation, preserve the anatomy contract exactly. Keep each existing target structure continuous and rooted at its current attachment point. Structures integrated into and anchored to the selected target are allowed; do not describe independently rooted appendages, new anatomical roots, extra tails, tentacles, limbs, wings or heads. A tail remains one continuous tail unless an authorized body-plan mutation explicitly says otherwise.',
              ]),
        `Functional direction: ${functionalDirection}. Use the biological function to invent the mutation, but describe visible anatomy rather than explaining its purpose. It is not a limit on the concrete morphology.`,
        'BIOLOGICAL PRIOR: Prefer naturally grown animal anatomy and biological tissues. Evolutionary structures must look grown from this creature itself. Avoid manufactured, mechanical, metallic, technological or worn structures unless the concept explicitly requires them. Biological carapaces, chitin, bone, keratin, scales, mineralized skin, spines and biological plates remain valid.',
        ...(structural && !tailStructural
            ? [
                  `AUTHORIZED BODY-PLAN MUTATION: ${contract.structuralChange} Describe the mutation as this structural change actually realised on the creature.`,
              ]
            : []),
        `ANATOMY CONTRACT: ${(tailStructural ? contract.topologyInvariants.filter((invariant) => !/\btails?\b/i.test(invariant)) : contract.topologyInvariants).join(' ')}`,
        `PRESERVE: ${contract.preservationRules.join(' ')}`,
        ...(plan.evolutionTargetId === 'SKIN_AND_COVERING'
            ? [
                  'SKIN SURFACE-FIRST BOUNDARY: Treat this as a conformal, anatomy-following covering mutation. The primary evolutionary change acts on the creature\'s existing biological surface and may strongly modify dominant palette and pigmentation, biological patterns, scale morphology and grain, dermal texture, skin thickness, translucency, iridescence and sheen, bioluminescent pigmentation, and other biological covering that remains attached and conformal to the existing body surface.',
                  'SKIN SURFACE LIMITS: Scales, plating, fur and feather-like covering are valid only when surface-bound and conformal to the existing anatomy. They may be visually prominent and strongly transform the creature\'s phenotype, but must not create a new anatomical macro-structure or significantly change the existing silhouette.',
                  'Do not propose dorsal spines, horns, crests, fins, fronds, sails, long projecting plates, new appendages or other protruding structures that substantially change the silhouette. Do not change body shape, topology, pose, stance, limb structure, tail structure or anatomical roots. The mutation must read primarily as an evolution of the creature\'s skin and body covering, not as a new dorsal or anatomical structure.',
              ]
            : []),
        `CURRENT SOURCE IMAGE: the creature currently looks like the supplied source image. Creature identity: ${input.identity.description} Preserve: ${input.identity.identityFeatures.join('; ')}.`,
        `MUTABLE APPEARANCE: ${mutableAppearance}. These are not identity invariants. A visible colour treatment is optional: use it only as a biologically motivated, target-linked secondary adaptation. When warranted, state its location and biological role as part of mutationIdea or visualDetails; otherwise preserve the current coloration.`,
        `CURRENT TARGET STATE: ${describeCurrentTargetState(plan.lineage)}`,
        ...(retryForNovelty && plan.noveltyReferences.length
            ? [
                  `NOVELTY RETRY: a recent local mutation of this same target was too similar: ${describeNoveltyReferences(plan.noveltyReferences)}. Choose a genuinely different morphological direction for this target (different form, material, arrangement or growth pattern), while keeping the mutation local and respecting the same anatomy contract.`,
              ]
            : []),
        'Do not write an image-generation prompt, technical instructions, a body-area catalog, an archetype, a biological essay, a separate colour schema or extra fields.',
    ].join('\n')
}

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    // Strict Structured Outputs requires every declared property to be required.
    // An empty list preserves the domain-level optionality of `avoid`.
    required: ['conceptName', 'mutationIdea', 'visualDetails', 'avoid'],
    properties: {
        conceptName: { type: 'string' },
        mutationIdea: { type: 'string' },
        visualDetails: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
        avoid: { type: 'array', maxItems: 4, items: { type: 'string' } },
    },
} as const

function extractOutputText(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    if (typeof root.output_text === 'string' && root.output_text.trim()) return root.output_text
    if (!Array.isArray(root.output)) return null
    for (const item of root.output) {
        const content = item && typeof item === 'object' ? (item as Record<string, unknown>).content : null
        if (!Array.isArray(content)) continue
        for (const entry of content) {
            const text = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).text : null
            if (typeof text === 'string' && text.trim()) return text
        }
    }
    return null
}

export class FluxMicroConceptGenerator {
    private readonly fetchImplementation: FetchLike
    private readonly timeoutMs: number

    constructor(private readonly options: FluxMicroConceptGeneratorOptions) {
        if (!options.apiKey.trim() || !options.model.trim())
            throw new FluxMicroConceptGeneratorError(
                'FLUX_CONCEPT_NOT_CONFIGURED',
                'La configurazione del micro-concept FLUX non e completa.',
            )
        this.fetchImplementation = options.fetchImplementation ?? fetch
        this.timeoutMs = options.timeoutMs ?? 20_000
    }

    async generate(input: GenerateFluxMicroConceptInput): Promise<FluxMicroConcept> {
        let retryForNovelty = false
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
            try {
                const response = await this.fetchImplementation('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.options.model,
                        store: false,
                        input: [
                            {
                                role: 'developer',
                                content: [
                                    {
                                        type: 'input_text',
                                        text: composeFluxMicroConceptInstructions(input, retryForNovelty),
                                    },
                                ],
                            },
                        ],
                        text: {
                            format: { type: 'json_schema', name: 'flux_micro_concept', strict: true, schema: SCHEMA },
                        },
                    }),
                    signal: controller.signal,
                })
                if (!response.ok)
                    throw new FluxMicroConceptGeneratorError(
                        'FLUX_CONCEPT_PROVIDER_ERROR',
                        'Il provider del micro-concept FLUX ha rifiutato la richiesta.',
                    )
                const output = extractOutputText(await response.json())
                let concept: FluxMicroConcept | null = null
                try {
                    concept = output ? parseFluxMicroConcept(JSON.parse(output)) : null
                } catch {
                    /* retry a malformed schema response once */
                }
                const isNovel = concept ? isNovelFluxMicroConcept(concept, input.plan) : false
                if (concept && isTopologicallyCompatibleFluxMicroConcept(concept, input.plan) && isNovel) return concept
                retryForNovelty ||= Boolean(concept && !isNovel)
                if (attempt === 0) continue
                throw new FluxMicroConceptGeneratorError(
                    'FLUX_CONCEPT_RESPONSE_INVALID',
                    'Il micro-concept FLUX non rispetta il contratto.',
                )
            } catch (error) {
                if (error instanceof FluxMicroConceptGeneratorError) throw error
                if (controller.signal.aborted)
                    throw new FluxMicroConceptGeneratorError(
                        'FLUX_CONCEPT_TIMEOUT',
                        'Il micro-concept FLUX ha superato il tempo massimo.',
                        { cause: error },
                    )
                throw new FluxMicroConceptGeneratorError(
                    'FLUX_CONCEPT_PROVIDER_ERROR',
                    'Il provider del micro-concept FLUX non e raggiungibile.',
                    { cause: error },
                )
            } finally {
                clearTimeout(timeout)
            }
        }
        throw new FluxMicroConceptGeneratorError(
            'FLUX_CONCEPT_RESPONSE_INVALID',
            'Il micro-concept FLUX non rispetta il contratto.',
        )
    }
}
