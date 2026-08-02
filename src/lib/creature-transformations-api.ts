import type {
    GenerateConceptApiResponse,
    GenerateConceptErrorResponse,
    GenerateConceptRequest,
} from '../../shared/creature-transformations/index.ts'
import { requireSupabase } from './supabase'

type FunctionInvokeError = Error & { context?: unknown }

export class CreatureTransformationApiError extends Error {
    readonly code: string
    readonly requestId?: string
    readonly problems?: GenerateConceptErrorResponse['problems']

    constructor(response: GenerateConceptErrorResponse) {
        super(response.message)
        this.name = 'CreatureTransformationApiError'
        this.code = response.code
        this.requestId = response.requestId
        this.problems = response.problems
    }
}

export type CreatureTransformationFunctionInvoker = {
    invoke: (name: string, options: { body: GenerateConceptRequest }) => Promise<{ data: unknown; error: unknown }>
}

function isErrorResponse(value: unknown): value is GenerateConceptErrorResponse {
    return Boolean(value)
        && typeof value === 'object'
        && (value as { success?: unknown }).success === false
        && typeof (value as { code?: unknown }).code === 'string'
        && typeof (value as { message?: unknown }).message === 'string'
        && typeof (value as { requestId?: unknown }).requestId === 'string'
}

function isSuccessResponse(value: unknown): value is Extract<GenerateConceptApiResponse, { success: true }> {
    return Boolean(value)
        && typeof value === 'object'
        && (value as { success?: unknown }).success === true
        && typeof (value as { requestId?: unknown }).requestId === 'string'
}

async function readFunctionError(error: unknown): Promise<GenerateConceptErrorResponse | null> {
    const context = (error as FunctionInvokeError | null)?.context
    if (typeof Response === 'undefined' || !(context instanceof Response)) return null

    try {
        const payload = await context.clone().json()
        return isErrorResponse(payload) ? payload : null
    } catch {
        return null
    }
}

export function createConceptIdempotencyKey(): string {
    return crypto.randomUUID()
}

export async function generateCreatureTransformationConcept(
    request: GenerateConceptRequest,
    invoker: CreatureTransformationFunctionInvoker = requireSupabase().functions,
): Promise<Extract<GenerateConceptApiResponse, { success: true }>> {
    const { data, error } = await invoker.invoke('generate-creature-transformation', { body: request })

    if (error) {
        const response = await readFunctionError(error)
        if (response) throw new CreatureTransformationApiError(response)
        throw new Error(error instanceof Error ? error.message : 'Impossibile contattare il laboratorio trasformazioni.')
    }
    if (isErrorResponse(data)) throw new CreatureTransformationApiError(data)
    if (!isSuccessResponse(data)) throw new Error('Il laboratorio ha restituito una risposta non riconosciuta.')
    return data
}

