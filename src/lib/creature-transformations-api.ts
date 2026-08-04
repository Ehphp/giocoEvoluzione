import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateConceptRequest,
    GenerateImageApiResponse,
    GenerateImageRequest,
    GenerateUnlockedTransformationRequest,
    SelectCreatureVisualProgressTrackRequest,
    GetCreatureVisualProgressRequest,
    GetCurrentCreatureVisualRequest,
    GetGameCreatureVisualsRequest,
    AdoptCreatureTransformationRequest,
    RollbackCreatureVisualVersionRequest,
    GetBenchmarkResultsRequest,
    GetTransformationRequestStatusRequest,
    SubmitExperimentReviewRequest,
    SubmitBackgroundRemovalCandidateRequest,
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

type CreatureTransformationFunctionRequest = GenerateConceptRequest | GenerateImageRequest | GetTransformationRequestStatusRequest | SubmitExperimentReviewRequest | SubmitBackgroundRemovalCandidateRequest | GetBenchmarkResultsRequest | GenerateUnlockedTransformationRequest | SelectCreatureVisualProgressTrackRequest | GetCreatureVisualProgressRequest | GetCurrentCreatureVisualRequest | GetGameCreatureVisualsRequest | AdoptCreatureTransformationRequest | RollbackCreatureVisualVersionRequest

export type CreatureTransformationFunctionInvoker = {
    invoke: (name: string, options: { body: CreatureTransformationFunctionRequest; headers?: Record<string, string> }) => Promise<{ data: unknown; error: unknown }>
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

export const createVisualTransformationIdempotencyKey = createImageIdempotencyKey

async function requireRefreshedSession() {
    const supabase = requireSupabase()
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session?.access_token) {
        await supabase.auth.signOut({ scope: 'local' })
        throw new Error('La sessione non e piu valida. Accedi di nuovo per usare l evoluzione della creatura.')
    }
    return { supabase, accessToken: data.session.access_token }
}

async function createAuthenticatedInvoker(): Promise<CreatureTransformationFunctionInvoker> {
    const supabase = requireSupabase()
    const { data: initial } = await supabase.auth.getSession()
    const expiresSoon = initial.session?.expires_at !== undefined && initial.session.expires_at * 1000 <= Date.now() + 60_000
    let accessToken = initial.session?.access_token ?? null
    if (!initial.session || expiresSoon) {
        accessToken = (await requireRefreshedSession()).accessToken
    }
    if (!accessToken) {
        throw new Error('La sessione e scaduta. Accedi di nuovo per usare l evoluzione della creatura.')
    }
    return {
        invoke: (name, options) => supabase.functions.invoke(name, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
        }),
    }
}

async function invokeCreatureTransformation<TResponse extends Extract<CreatureTransformationApiResponse, { success: true }>>(
    request: CreatureTransformationFunctionRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<TResponse> {
    let activeInvoker = invoker ?? await createAuthenticatedInvoker()
    let { data, error } = await activeInvoker.invoke('generate-creature-transformation', { body: request })

    if (error) {
        const response = await readFunctionError(error)
        if (!invoker && response?.code === 'UNAUTHENTICATED') {
            const refreshed = await requireRefreshedSession()
            activeInvoker = {
                invoke: (name, options) => refreshed.supabase.functions.invoke(name, {
                    ...options,
                    headers: { ...options.headers, Authorization: `Bearer ${refreshed.accessToken}` },
                }),
            }
                ; ({ data, error } = await activeInvoker.invoke('generate-creature-transformation', { body: request }))
            if (!error) {
                if (isErrorResponse(data)) throw new CreatureTransformationApiError(data)
                if (!isSuccessResponse(data)) throw new Error('Il laboratorio ha restituito una risposta non riconosciuta.')
                return data as TResponse
            }
            const retryResponse = await readFunctionError(error)
            if (retryResponse) throw new CreatureTransformationApiError(retryResponse)
        }
        if (response) throw new CreatureTransformationApiError(response)
        throw new Error(error instanceof Error ? error.message : 'Impossibile contattare il laboratorio trasformazioni.')
    }
    if (isErrorResponse(data)) throw new CreatureTransformationApiError(data)
    if (!isSuccessResponse(data)) throw new Error('Il laboratorio ha restituito una risposta non riconosciuta.')
    return data as TResponse
}

export async function generateCreatureTransformationConcept(
    request: GenerateConceptRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<Extract<GenerateConceptApiResponse, { success: true }>> {
    return invokeCreatureTransformation<Extract<GenerateConceptApiResponse, { success: true }>>(request, invoker)
}

export async function generateCreatureTransformationImage(
    request: GenerateImageRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<Extract<GenerateImageApiResponse, { success: true }>> {
    return invokeCreatureTransformation<Extract<GenerateImageApiResponse, { success: true }>>(request, invoker)
}

export async function getCreatureTransformationRequestStatus(
    request: GetTransformationRequestStatusRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<TransformationRequestStatusResponse> {
    return invokeCreatureTransformation<TransformationRequestStatusResponse>(request, invoker)
}

export async function submitCreatureTransformationExperimentReview(
    request: SubmitExperimentReviewRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<Extract<CreatureTransformationApiResponse, { success: true, review: unknown }>> {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, review: unknown }>>(request, invoker)
}

export async function getCreatureTransformationBenchmarkResults(
    request: GetBenchmarkResultsRequest = { operation: 'GET_BENCHMARK_RESULTS' },
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<Extract<CreatureTransformationApiResponse, { success: true, entries: unknown }>> {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, entries: unknown }>>(request, invoker)
}

export async function selectCreatureVisualProgressTrack(request: SelectCreatureVisualProgressTrackRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, track: unknown, currentVersion: unknown }>>(request, invoker)
}

export async function getCreatureVisualProgress(request: GetCreatureVisualProgressRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, track: unknown, currentVersion: unknown }>>(request, invoker)
}

export async function getCurrentCreatureVisual(request: GetCurrentCreatureVisualRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, visual: unknown }>>(request, invoker)
}

export async function getGameCreatureVisuals(request: GetGameCreatureVisualsRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, player: unknown, opponent: unknown }>>(request, invoker)
}

export async function generateUnlockedCreatureTransformation(request: GenerateUnlockedTransformationRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, accepted: true }>>(request, invoker)
}

export async function submitBackgroundRemovalCandidate(request: SubmitBackgroundRemovalCandidateRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, candidate: unknown }>>(request, invoker)
}


export async function adoptCreatureTransformation(request: AdoptCreatureTransformationRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, version: unknown }>>(request, invoker)
}

export async function rollbackCreatureVisualVersion(request: RollbackCreatureVisualVersionRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, version: unknown }>>(request, invoker)
}
