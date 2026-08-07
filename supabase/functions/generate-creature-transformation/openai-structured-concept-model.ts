import type { StructuredConceptModel, StructuredConceptModelInput } from '../../../shared/creature-transformations/concept-generator.ts'
import { getEvolutionConstraints } from '../../../shared/creature-transformations/evolution-constraints.ts'

type FetchLike = typeof fetch

export type OpenAiStructuredConceptModelErrorCode =
    | 'AI_NOT_CONFIGURED'
    | 'AI_TIMEOUT'
    | 'AI_RATE_LIMITED'
    | 'AI_BAD_REQUEST'
    | 'AI_AUTHENTICATION_FAILED'
    | 'AI_PERMISSION_DENIED'
    | 'AI_NETWORK_ERROR'
    | 'AI_PROVIDER_ERROR'
    | 'AI_RESPONSE_INVALID'

export class OpenAiStructuredConceptModelError extends Error {
    readonly code: OpenAiStructuredConceptModelErrorCode
    readonly providerErrorCode: string | null

    constructor(code: OpenAiStructuredConceptModelErrorCode, message: string, options?: { cause?: unknown, providerErrorCode?: string | null }) {
        super(message, options)
        this.name = 'OpenAiStructuredConceptModelError'
        this.code = code
        this.providerErrorCode = options?.providerErrorCode ?? null
    }
}

export type OpenAiStructuredConceptModelOptions = Readonly<{
    apiKey: string
    model: string
    timeoutMs?: number
    fetchImplementation?: FetchLike
}>

function mapProviderHttpFailure(status: number): OpenAiStructuredConceptModelErrorCode {
    if (status === 400) return 'AI_BAD_REQUEST'
    if (status === 401) return 'AI_AUTHENTICATION_FAILED'
    if (status === 403) return 'AI_PERMISSION_DENIED'
    return 'AI_PROVIDER_ERROR'
}

async function readSafeProviderErrorCode(response: Response): Promise<string | null> {
    try {
        const payload: unknown = await response.clone().json()
        const error = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).error : null
        const code = error && typeof error === 'object' ? (error as Record<string, unknown>).code : null
        return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : null
    } catch {
        return null
    }
}

function createInstructions(input: StructuredConceptModelInput): string {
    const constraints = getEvolutionConstraints({
        evolutionTarget: input.evolutionTarget,
        visualTrait: input.visualTrait,
        evolutionFunction: input.evolutionFunction,
        intensity: input.intensity,
    })
    const correctionFeedback = input.correctionFeedback.length
        ? `Correction feedback from the prior attempt: ${input.correctionFeedback.join(' | ')}.`
        : 'There is no correction feedback for this first attempt.'

    return [
        'Create one creature transformation concept as strict JSON only.',
        'Describe the same individual; preserve its recognisable identity and illustrated style.',
        `Creature description: ${input.identity.description}`,
        `Identity features to preserve: ${input.identity.identityFeatures.join('; ')}`,
        `Style definition: ${input.identity.styleDefinition}`,
        `Current mutable visual appearance: ${input.identity.mutableVisualFeatures.join('; ')}. This is reference appearance, not immutable identity.`,
        `Requested visual trait: ${input.visualTrait.id}.`,
        input.evolutionTarget
            ? `Requested anatomical target: ${input.evolutionTarget.id}. Focus the dominant new mutation on exactly one of: ${constraints.allowedPrimaryBodyAreas.join(', ')}. Supporting anatomy is optional and may use at most one of: ${constraints.allowedSupportingBodyAreas.join(', ')}. The resolved evolution function is ${input.evolutionFunction}. Do not add a major mutation to any other region.`
            : 'This is a legacy trait-based concept with no anatomical target.',
        `Requested intensity: ${input.intensity}.`,
        input.previousTransformations?.length
            ? `Previously adopted visual transformations that must remain visible and must not be repeated: ${input.previousTransformations.map((entry) => `v${entry.versionNumber} ${entry.visualTraitId}: ${entry.conceptName}`).join('; ')}.`
            : 'There are no prior adopted visual transformations.',
        `Allowed primary body areas: ${constraints.allowedPrimaryBodyAreas.join(', ')}.`,
        `Allowed mutation archetypes: ${input.visualTrait.allowedMutationArchetypes.join(', ')}.`,
        `Creative limits: at most ${input.visualTrait.creativeLimits.maxPrimaryBodyAreas} primary body areas and ${input.visualTrait.creativeLimits.maxSecondaryMutations} secondary mutations.`,
        'Propose exactly one additional primary mutation. Preserve all previously adopted mutations, do not repeat an earlier concept, and do not remove prior visual adaptations. Do not introduce a new species, clothing, weapons, text, scenes, technical rendering instructions, paths, or URLs.',
        input.evolutionTarget
            ? `Always return colorEvolution. Allowed modes: ${constraints.colorEvolution.allowedModes.join(', ')}. PRESERVE uses intensity 0 with no added colours, effects or affected areas. Non-preserve modes use intensity ${input.intensity}, must affect only: ${constraints.allowedColorBodyAreas.join(', ')}${constraints.colorEvolution.requiresVisuallySignificantAreaForModes.length ? `, and must include one of the readable full-image areas: ${constraints.colorEvolution.visuallySignificantBodyAreas.join(', ')}` : ''}${constraints.colorEvolution.requiresSkinSurfaceForModes.length ? ', and must include SKIN_SURFACE' : ''}. Give a biological rationale tied to the requested trait and mutation material. Never list mutable colour or palette traits in identityToPreserve when colorEvolution is EXPAND or SHIFT.`
            : 'Do not return colorEvolution for this legacy trait-based concept; retain the established palette.',
        'Return all required fields and no additional fields. Do not include markdown or explanations.',
        correctionFeedback,
    ].join('\n')
}

function createConceptJsonSchema(input: StructuredConceptModelInput): Record<string, unknown> {
    const target = input.evolutionTarget
    const constraints = getEvolutionConstraints({
        evolutionTarget: target,
        visualTrait: input.visualTrait,
        evolutionFunction: input.evolutionFunction,
        intensity: input.intensity,
    })
    const colorEvolutionSchema = !target ? {} : {
        colorEvolution: {
            type: 'object',
            additionalProperties: false,
            required: ['mode', 'dominantColor', 'secondaryColors', 'accentColors', 'surfaceEffects', 'affectedBodyAreas', 'intensity', 'biologicalRationale'],
            properties: {
                mode: { type: 'string', enum: constraints.colorEvolution.allowedModes },
                dominantColor: { type: 'string' },
                secondaryColors: { type: 'array', items: { type: 'string' } },
                accentColors: { type: 'array', items: { type: 'string' } },
                surfaceEffects: { type: 'array', items: { type: 'string' } },
                affectedBodyAreas: { type: 'array', items: { enum: constraints.allowedColorBodyAreas } },
                intensity: {
                    type: 'integer',
                    enum: [...new Set(constraints.colorEvolution.allowedModes.flatMap((mode) => constraints.colorEvolution.allowedIntensities[mode]))],
                },
                biologicalRationale: { type: 'string' },
            },
        },
    }
    return {
        type: 'object',
        additionalProperties: false,
        required: [
            'schemaVersion', 'visualTrait', ...(target ? ['evolutionTargetId', 'evolutionFunction'] : []), 'conceptName', 'evolutionaryFunction', 'primaryMutation',
            'secondaryMutations', 'identityToPreserve', 'forbiddenChanges', 'intensity',
            ...(target ? ['colorEvolution'] : []),
        ],
        properties: {
            schemaVersion: { type: 'integer', enum: [target ? 2 : 1] },
            visualTrait: { type: 'string', enum: [input.visualTrait.id] },
            ...(target ? {
                evolutionTargetId: { type: 'string', enum: [target.id] },
                evolutionFunction: { type: 'string', enum: [input.evolutionFunction] },
            } : {}),
            conceptName: { type: 'string' },
            evolutionaryFunction: { type: 'string' },
            primaryMutation: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'mutationArchetype', 'bodyAreas', 'morphology', 'material',
                    ...(target ? ['supportingBodyAreas'] : []),
                ],
                properties: {
                    mutationArchetype: { enum: input.visualTrait.allowedMutationArchetypes },
                    bodyAreas: {
                        type: 'array',
                        minItems: 1,
                        maxItems: target ? 1 : input.visualTrait.creativeLimits.maxPrimaryBodyAreas,
                        items: { enum: constraints.allowedPrimaryBodyAreas },
                    },
                    ...(target ? {
                        supportingBodyAreas: {
                            type: 'array', maxItems: 1,
                            items: { enum: constraints.allowedSupportingBodyAreas },
                        },
                    } : {}),
                    morphology: { type: 'string' },
                    material: { type: 'string' },
                },
            },
            secondaryMutations: {
                type: 'array',
                maxItems: input.visualTrait.creativeLimits.maxSecondaryMutations,
                items: { type: 'string' },
            },
            identityToPreserve: { type: 'array', items: { type: 'string' } },
            forbiddenChanges: { type: 'array', items: { type: 'string' } },
            intensity: { type: 'integer', enum: [input.intensity] },
            ...colorEvolutionSchema,
        },
    }
}

function extractOutputText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
        throw new OpenAiStructuredConceptModelError('AI_RESPONSE_INVALID', 'Il provider non ha restituito un payload valido.')
    }
    const record = payload as Record<string, unknown>
    if (typeof record.output_text === 'string' && record.output_text.trim()) {
        return record.output_text
    }
    if (Array.isArray(record.output)) {
        for (const outputItem of record.output) {
            if (!outputItem || typeof outputItem !== 'object') continue
            const content = (outputItem as Record<string, unknown>).content
            if (!Array.isArray(content)) continue
            for (const contentItem of content) {
                if (!contentItem || typeof contentItem !== 'object') continue
                const text = (contentItem as Record<string, unknown>).text
                if (typeof text === 'string' && text.trim()) return text
            }
        }
    }
    throw new OpenAiStructuredConceptModelError('AI_RESPONSE_INVALID', 'Il provider non ha restituito structured output testuale.')
}

export class OpenAiStructuredConceptModel implements StructuredConceptModel {
    private readonly apiKey: string
    private readonly model: string
    private readonly timeoutMs: number
    private readonly fetchImplementation: FetchLike

    constructor(options: OpenAiStructuredConceptModelOptions) {
        if (!options.apiKey.trim() || !options.model.trim()) {
            throw new OpenAiStructuredConceptModelError('AI_NOT_CONFIGURED', 'La configurazione AI non e completa.')
        }
        this.apiKey = options.apiKey
        this.model = options.model
        this.timeoutMs = options.timeoutMs ?? 20_000
        this.fetchImplementation = options.fetchImplementation ?? fetch
    }

    async generateStructuredConcept(input: StructuredConceptModelInput): Promise<unknown> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

        try {
            const response = await this.fetchImplementation('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    store: false,
                    input: [{ role: 'developer', content: [{ type: 'input_text', text: createInstructions(input) }] }],
                    text: {
                        format: {
                            type: 'json_schema',
                            name: 'creature_transformation_concept',
                            strict: true,
                            schema: createConceptJsonSchema(input),
                        },
                    },
                }),
                signal: controller.signal,
            })
            if (response.status === 429) {
                throw new OpenAiStructuredConceptModelError('AI_RATE_LIMITED', 'Il provider AI ha applicato un rate limit.')
            }
            if (!response.ok) {
                throw new OpenAiStructuredConceptModelError(mapProviderHttpFailure(response.status), 'Il provider AI non ha completato la richiesta.', {
                    providerErrorCode: await readSafeProviderErrorCode(response),
                })
            }

            let payload: unknown
            try {
                payload = await response.json()
            } catch (error) {
                throw new OpenAiStructuredConceptModelError('AI_RESPONSE_INVALID', 'Il provider AI ha restituito una risposta non JSON.', { cause: error })
            }
            try {
                return JSON.parse(extractOutputText(payload))
            } catch (error) {
                if (error instanceof OpenAiStructuredConceptModelError) throw error
                throw new OpenAiStructuredConceptModelError('AI_RESPONSE_INVALID', 'Lo structured output AI non e JSON valido.', { cause: error })
            }
        } catch (error) {
            if (error instanceof OpenAiStructuredConceptModelError) throw error
            if (controller.signal.aborted) {
                throw new OpenAiStructuredConceptModelError('AI_TIMEOUT', 'La richiesta al provider AI ha superato il timeout.', { cause: error })
            }
            throw new OpenAiStructuredConceptModelError('AI_NETWORK_ERROR', 'Il runtime non ha raggiunto il provider AI.', { cause: error })
        } finally {
            clearTimeout(timeoutId)
        }
    }
}
