import { parseFluxMicroConcept, type FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import { describeCurrentTargetState, describeOtherEstablishedEvolutions } from '../../../shared/creature-transformations/flux-evolution/evolution-lineage.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from '../../../shared/creature-transformations/evolution-targets.ts'

type FetchLike = typeof fetch

export type FluxMicroConceptGeneratorErrorCode = 'FLUX_CONCEPT_NOT_CONFIGURED' | 'FLUX_CONCEPT_TIMEOUT' | 'FLUX_CONCEPT_PROVIDER_ERROR' | 'FLUX_CONCEPT_RESPONSE_INVALID'

export class FluxMicroConceptGeneratorError extends Error {
    constructor(readonly code: FluxMicroConceptGeneratorErrorCode, message: string, options?: { cause?: unknown }) {
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
}>

export function composeFluxMicroConceptInstructions(input: GenerateFluxMicroConceptInput): string {
    const plan = input.plan
    const contract = plan.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[plan.evolutionTargetId]
    const structural = plan.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    return [
        'Return one strict JSON FluxMicroConcept and nothing else.',
        'Invent one creature mutation that is visually distinctive, surprising, clearly readable at gameplay scale and anatomically integrated.',
        `SELECTED TARGET: ${plan.evolutionTargetId} — ${target.promptRegion}. The new mutation lives exclusively there.`,
        `TARGET FREEDOM: ${contract.targetAllowances.join(' ')}`,
        `Functional direction: ${plan.evolutionFunction}. Use it as the biological purpose, not as a limit on the concrete morphology.`,
        ...(structural
            ? [`AUTHORIZED BODY-PLAN MUTATION: ${contract.structuralChange} Describe the mutation as this structural change actually realised on the creature.`]
            : []),
        `ANATOMY CONTRACT: ${contract.topologyInvariants.join(' ')}`,
        `PRESERVE: ${contract.preservationRules.join(' ')}`,
        `CURRENT SOURCE IMAGE: the creature currently looks like the supplied source image. Creature identity: ${input.identity.description} Preserve: ${input.identity.identityFeatures.join('; ')}.`,
        `CURRENT TARGET STATE: ${describeCurrentTargetState(plan.lineage)}`,
        `OTHER ESTABLISHED EVOLUTIONS: ${describeOtherEstablishedEvolutions(plan.lineage)}`,
        'Do not write an image-generation prompt, technical instructions, a body-area catalog, an archetype, a biological essay, a colour schema or extra fields.',
    ].join('\n')
}

const SCHEMA = {
    type: 'object', additionalProperties: false,
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
        if (!options.apiKey.trim() || !options.model.trim()) throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_NOT_CONFIGURED', 'La configurazione del micro-concept FLUX non e completa.')
        this.fetchImplementation = options.fetchImplementation ?? fetch
        this.timeoutMs = options.timeoutMs ?? 20_000
    }

    async generate(input: GenerateFluxMicroConceptInput): Promise<FluxMicroConcept> {
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
                        input: [{ role: 'developer', content: [{ type: 'input_text', text: composeFluxMicroConceptInstructions(input) }] }],
                        text: { format: { type: 'json_schema', name: 'flux_micro_concept', strict: true, schema: SCHEMA } },
                    }),
                    signal: controller.signal,
                })
                if (!response.ok) throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_PROVIDER_ERROR', 'Il provider del micro-concept FLUX ha rifiutato la richiesta.')
                const output = extractOutputText(await response.json())
                let concept: FluxMicroConcept | null = null
                try { concept = output ? parseFluxMicroConcept(JSON.parse(output)) : null } catch { /* retry a malformed schema response once */ }
                if (concept) return concept
                if (attempt === 0) continue
                throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_RESPONSE_INVALID', 'Il micro-concept FLUX non rispetta il contratto.')
            } catch (error) {
                if (error instanceof FluxMicroConceptGeneratorError) throw error
                if (controller.signal.aborted) throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_TIMEOUT', 'Il micro-concept FLUX ha superato il tempo massimo.', { cause: error })
                throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_PROVIDER_ERROR', 'Il provider del micro-concept FLUX non e raggiungibile.', { cause: error })
            } finally {
                clearTimeout(timeout)
            }
        }
        throw new FluxMicroConceptGeneratorError('FLUX_CONCEPT_RESPONSE_INVALID', 'Il micro-concept FLUX non rispetta il contratto.')
    }
}
