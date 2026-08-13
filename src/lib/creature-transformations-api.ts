import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateConceptRequest,
    GenerateImageApiResponse,
    GenerateImageRequest,
    GenerateCurrentPipelineExperimentRequest,
    GenerateLineageFirstExperimentRequest,
    SubmitLineageComparisonReviewRequest,
    GenerateUnlockedTransformationRequest,
    GenerateFluxEvolutionChainStepRequest,
    SelectCreatureVisualProgressTrackRequest,
    GetCreatureVisualProgressRequest,
    GetCurrentCreatureVisualRequest,
    GetGameCreatureVisualsRequest,
    AdoptCreatureTransformationRequest,
    RollbackCreatureVisualVersionRequest,
    GetBenchmarkResultsRequest,
    GetBenchmarkResultsResponse,
    GetTransformationRequestStatusRequest,
    GetCreatureTransformationLabUsageRequest,
    GetGeneratedImageCatalogRequest,
    GetLineageComparisonReviewsRequest,
    SubmitExperimentReviewRequest,
    SubmitBackgroundRemovalCandidateRequest,
    ListVisualBackgroundCleanupRequest,
    SubmitVisualBackgroundCleanupRequest,
    ListVisualBackgroundCleanupResponse,
    SubmitVisualBackgroundCleanupResponse,
    TransformationRequestStatusResponse,
    CreatureTransformationLabUsageResponse,
    GeneratedImageCatalogResponse,
    GetLineageComparisonReviewsResponse,
    CurrentCreatureVisualApiResponse,
    GameCreatureVisualsResponse,
} from '../../shared/creature-transformations/index.ts'
import { requireSupabase } from './supabase'
import { reuseCreatureVisualUrl } from './creature-visual-url-cache'

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

type CreatureTransformationFunctionRequest = GenerateConceptRequest | GenerateImageRequest | GenerateCurrentPipelineExperimentRequest | GenerateLineageFirstExperimentRequest | GetTransformationRequestStatusRequest | GetCreatureTransformationLabUsageRequest | GetGeneratedImageCatalogRequest | GetLineageComparisonReviewsRequest | SubmitExperimentReviewRequest | SubmitLineageComparisonReviewRequest | SubmitBackgroundRemovalCandidateRequest | ListVisualBackgroundCleanupRequest | SubmitVisualBackgroundCleanupRequest | GetBenchmarkResultsRequest | GenerateUnlockedTransformationRequest | GenerateFluxEvolutionChainStepRequest | SelectCreatureVisualProgressTrackRequest | GetCreatureVisualProgressRequest | GetCurrentCreatureVisualRequest | GetGameCreatureVisualsRequest | AdoptCreatureTransformationRequest | RollbackCreatureVisualVersionRequest

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

export async function generateLineageFirstExperiment(
    request: GenerateLineageFirstExperimentRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<GenerateImageApiResponse> {
    return invokeCreatureTransformation<GenerateImageApiResponse & Extract<CreatureTransformationApiResponse, { success: true }>>(request, invoker)
}

export async function generateCurrentPipelineExperiment(request: GenerateCurrentPipelineExperimentRequest, invoker?: CreatureTransformationFunctionInvoker): Promise<GenerateImageApiResponse> {
    return invokeCreatureTransformation<GenerateImageApiResponse & Extract<CreatureTransformationApiResponse, { success: true }>>(request, invoker)
}

export async function submitLineageComparisonReview(request: SubmitLineageComparisonReviewRequest, invoker?: CreatureTransformationFunctionInvoker): Promise<Extract<CreatureTransformationApiResponse, { success: true, requestId: string }>> {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, requestId: string }>>(request, invoker)
}

export async function getCreatureTransformationRequestStatus(
    request: GetTransformationRequestStatusRequest,
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<TransformationRequestStatusResponse> {
    return invokeCreatureTransformation<TransformationRequestStatusResponse>(request, invoker)
}

export async function getCreatureTransformationLabUsage(
    request: GetCreatureTransformationLabUsageRequest = { operation: 'GET_LAB_USAGE' },
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<CreatureTransformationLabUsageResponse> {
    return invokeCreatureTransformation<CreatureTransformationLabUsageResponse>(request, invoker)
}

export async function getGeneratedImageCatalog(
    request: GetGeneratedImageCatalogRequest = { operation: 'GET_GENERATED_IMAGE_CATALOG' },
    invoker?: CreatureTransformationFunctionInvoker,
): Promise<GeneratedImageCatalogResponse> {
    return invokeCreatureTransformation<GeneratedImageCatalogResponse>(request, invoker)
}

export async function getLineageComparisonReviews(request: GetLineageComparisonReviewsRequest, invoker?: CreatureTransformationFunctionInvoker): Promise<GetLineageComparisonReviewsResponse> {
    return invokeCreatureTransformation<GetLineageComparisonReviewsResponse>(request, invoker)
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
): Promise<GetBenchmarkResultsResponse> {
    return invokeCreatureTransformation<GetBenchmarkResultsResponse>(request, invoker)
}

export async function selectCreatureVisualProgressTrack(request: SelectCreatureVisualProgressTrackRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, track: unknown, currentVersion: unknown }>>(request, invoker)
}

export async function getCreatureVisualProgress(request: GetCreatureVisualProgressRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, track: unknown, currentVersion: unknown }>>(request, invoker)
}

export async function getCurrentCreatureVisual(request: GetCurrentCreatureVisualRequest, invoker?: CreatureTransformationFunctionInvoker) {
    const response = await invokeCreatureTransformation<CurrentCreatureVisualApiResponse>(request, invoker)
    return { ...response, visual: reuseCreatureVisualUrl(response.visual) }
}

export async function getGameCreatureVisuals(request: GetGameCreatureVisualsRequest, invoker?: CreatureTransformationFunctionInvoker) {
    const response = await invokeCreatureTransformation<GameCreatureVisualsResponse>(request, invoker)
    return { ...response, player: reuseCreatureVisualUrl(response.player), opponent: response.opponent ? reuseCreatureVisualUrl(response.opponent) : null }
}

export async function generateUnlockedCreatureTransformation(request: GenerateUnlockedTransformationRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, accepted: true }>>(request, invoker)
}

export async function generateFluxEvolutionChainStep(request: GenerateFluxEvolutionChainStepRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, accepted: true }>>(request, invoker)
}

export async function submitBackgroundRemovalCandidate(request: SubmitBackgroundRemovalCandidateRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, candidate: unknown }>>(request, invoker)
}

export async function listVisualBackgroundCleanup(request: ListVisualBackgroundCleanupRequest = { operation: 'LIST_VISUAL_BACKGROUND_CLEANUP' }, invoker?: CreatureTransformationFunctionInvoker): Promise<ListVisualBackgroundCleanupResponse> {
    return invokeCreatureTransformation<ListVisualBackgroundCleanupResponse>(request, invoker)
}

export async function submitVisualBackgroundCleanup(request: SubmitVisualBackgroundCleanupRequest, invoker?: CreatureTransformationFunctionInvoker): Promise<SubmitVisualBackgroundCleanupResponse> {
    return invokeCreatureTransformation<SubmitVisualBackgroundCleanupResponse>(request, invoker)
}


export async function adoptCreatureTransformation(request: AdoptCreatureTransformationRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, version: unknown }>>(request, invoker)
}

export async function rollbackCreatureVisualVersion(request: RollbackCreatureVisualVersionRequest, invoker?: CreatureTransformationFunctionInvoker) {
    return invokeCreatureTransformation<Extract<CreatureTransformationApiResponse, { success: true, version: unknown }>>(request, invoker)
}
