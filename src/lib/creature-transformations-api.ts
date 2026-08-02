import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateConceptRequest,
    GenerateImageApiResponse,
    GenerateImageRequest,
    GetTransformationRequestStatusRequest,
    TransformationRequestStatusResponse,
} from '../../shared/creature-transformations/index.ts'
import { requireSupabase } from './supabase'

type FunctionInvokeError = Error & { context?: unknown }

export class CreatureTransformationApiError extends Error {
    readonly code: string
    readonly requestId?: string
    readonly problems?: CreatureTransformationErrorResponse['problems']
    readonly requestPersistence?: CreatureTransformationErrorResponse['requestPersistence']

    constructor(response: CreatureTransformationErrorResponse) {
        super(response.message)
        this.name = 'CreatureTransformationApiError'
        this.code = response.code
        this.requestId = response.requestId
        this.problems = response.problems
        this.requestPersistence = response.requestPersistence
    }
}

export type CreatureTransformationFunctionInvoker = {
    invoke: (name: string, options: { body: GenerateConceptRequest | GenerateImageRequest | GetTransformationRequestStatusRequest }) => Promise<{ data: unknown; error: unknown }>
}

function isErrorResponse(value: unknown): value is CreatureTransformationErrorResponse {
    return Boolean(value)
        && typeof value === 'object'
        && (value as { success?: unknown }).success === false
        && typeof (value as { code?: unknown }).code === 'string'
        && typeof (value as { message?: unknown }).message === 'string'
        && typeof (value as { requestId?: unknown }).requestId === 'string'
}

function isSuccessResponse(value: unknown): value is Extract<CreatureTransformationApiResponse, { success: true }> {
    return Boolean(value)
        && typeof value === 'object'
        && (value as { success?: unknown }).success === true
        && typeof (value as { requestId?: unknown }).requestId === 'string'
}

async function readFunctionError(error: unknown): Promise<CreatureTransformationErrorResponse | null> {
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

export function createImageIdempotencyKey(): string {
    return crypto.randomUUID()
}

async function invokeCreatureTransformation<TResponse extends Extract<CreatureTransformationApiResponse, { success: true }>>(
    request: GenerateConceptRequest | GenerateImageRequest | GetTransformationRequestStatusRequest,
    invoker: CreatureTransformationFunctionInvoker,
): Promise<TResponse> {
    const { data, error } = await invoker.invoke('generate-creature-transformation', { body: request })

    if (error) {
        const response = await readFunctionError(error)
        if (response) throw new CreatureTransformationApiError(response)
        throw new Error(error instanceof Error ? error.message : 'Impossibile contattare il laboratorio trasformazioni.')
    }
    if (isErrorResponse(data)) throw new CreatureTransformationApiError(data)
    if (!isSuccessResponse(data)) throw new Error('Il laboratorio ha restituito una risposta non riconosciuta.')
    return data as TResponse
}

export async function generateCreatureTransformationConcept(
    request: GenerateConceptRequest,
    invoker: CreatureTransformationFunctionInvoker = requireSupabase().functions,
): Promise<Extract<GenerateConceptApiResponse, { success: true }>> {
    return invokeCreatureTransformation<Extract<GenerateConceptApiResponse, { success: true }>>(request, invoker)
}

export async function generateCreatureTransformationImage(
    request: GenerateImageRequest,
    invoker: CreatureTransformationFunctionInvoker = requireSupabase().functions,
): Promise<Extract<GenerateImageApiResponse, { success: true }>> {
    return invokeCreatureTransformation<Extract<GenerateImageApiResponse, { success: true }>>(request, invoker)
}

export async function getCreatureTransformationRequestStatus(
    request: GetTransformationRequestStatusRequest,
    invoker: CreatureTransformationFunctionInvoker = requireSupabase().functions,
): Promise<TransformationRequestStatusResponse> {
    return invokeCreatureTransformation<TransformationRequestStatusResponse>(request, invoker)
}
