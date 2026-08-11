import type { AnatomyContract } from '../../../shared/creature-transformations/flux-evolution/anatomy-contract.ts'
import { parseFluxMicroConcept, type FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import type { PreviousCreatureTransformationSummary } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import type { EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'

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
    evolutionTargetId: EvolutionTargetId
    anatomyContract: AnatomyContract
    previousTransformations: readonly PreviousCreatureTransformationSummary[]
}>

function instructions(input: GenerateFluxMicroConceptInput): string {
    const previous = input.previousTransformations.map((entry) => `${entry.evolutionTargetId ?? entry.visualTraitId}: ${entry.conceptName}${entry.mutationIdea ? ` — ${entry.mutationIdea}` : ''}`)
    return [
        'Return one strict JSON FluxMicroConcept and nothing else.',
        'Invent one local creature mutation that is original, playful, visually obvious and potentially strange.',
        `Selected anatomical target: ${input.evolutionTargetId}. Apply the new mutation exclusively there.`,
        `Creature identity: ${input.identity.description}. Preserve: ${input.identity.identityFeatures.join('; ')}.`,
        `Hard anatomy contract: ${[...input.anatomyContract.invariants, ...input.anatomyContract.targetRules, ...input.anatomyContract.failureConditions].join(' ')}`,
        previous.length
            ? `Adopted mutations to preserve and not repeat: ${previous.join('; ')}. If this target already evolved, develop what exists instead of replacing it.`
            : 'There are no adopted mutations yet.',
        'Do not write an image-generation prompt, technical instructions, body-area catalog, archetype, biological rationale, colour-evolution schema or extra fields.',
    ].join('\n')
}

const SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['conceptName', 'mutationIdea', 'visualDetails'],
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
                        input: [{ role: 'developer', content: [{ type: 'input_text', text: instructions(input) }] }],
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
