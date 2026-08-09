import type { GenerateImageResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureIdentityResolver, GenerateLineageFirstExperimentRequest } from '../../../shared/creature-transformations/contracts.ts'
import { composeLineageFirstPrompt } from '../../../shared/creature-transformations/experimental-lineage.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'

export type LineageFirstImageResult = Omit<GenerateImageResponse, 'requestPersistence'> & { sourceSha256: string, promptSha256: string, prompt: string, resultPath: string }

export async function generateLineageFirstImage(input: {
    profileId: string
    requestId: string
    request: GenerateLineageFirstExperimentRequest
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    provider: CreatureImageProvider
    sourcePath?: string
    validator?: ImageValidator
}): Promise<LineageFirstImageResult> {
    const validator = input.validator ?? new ImageValidator()
    const resolved = await input.resolver.resolve({ profileId: input.profileId, creatureId: input.request.creatureId })
    const prompt = composeLineageFirstPrompt({ identity: resolved.identity, lineage: input.request.lineage, evolutionTargetId: input.request.evolutionTargetId, ...(input.request.instruction ? { instruction: input.request.instruction } : {}) })
    const source = input.sourcePath ? await input.storage.readExperimentalSource(input.sourcePath) : await input.storage.readCanonicalSource(resolved.sourceImagePath, resolved.sourceIsBaseVersion)
    const validatedSource = await validator.validate({ bytes: source.bytes, mimeType: source.mimeType, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION })
    if (!validatedSource.valid) throw new Error('SOURCE_IMAGE_INVALID')
    const generated = await input.provider.transformCreature({ requestId: input.requestId, idempotencyKey: input.request.idempotencyKey, prompt, source: { bytes: source.bytes, mimeType: source.mimeType, width: validatedSource.metadata.width, height: validatedSource.metadata.height, sha256: validatedSource.metadata.sha256 }, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, backgroundGenerationMode: 'SOLID_FOR_POST_PROCESSING' })
    const output = await validator.validate({ bytes: generated.image, mimeType: generated.mimeType, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, sourceSha256: validatedSource.metadata.sha256, profile: 'FINAL_CREATURE_ASSET', requireAlpha: false })
    if (!output.valid) throw new Error('RESULT_IMAGE_INVALID')
    const stored = await input.storage.saveRawResult({ profileId: input.profileId, idempotencyKey: input.request.idempotencyKey, image: generated.image })
    const resultPath = await input.storage.createRawResultObjectPath(input.profileId, input.request.idempotencyKey)
    return { success: true, requestId: input.requestId, result: { signedUrl: stored.signedUrl, expiresAt: stored.expiresAt, mimeType: output.metadata.mimeType, width: output.metadata.width, height: output.metadata.height, sha256: output.metadata.sha256, assetReadiness: 'EXPERIMENT_ONLY' }, generation: { provider: generated.provider, model: generated.model, isMock: generated.isMock, ...(generated.providerRequestId ? { providerRequestId: generated.providerRequestId } : {}), latencyMs: generated.latencyMs, ...(generated.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: generated.estimatedCostUsd }) }, validation: { warnings: generated.warnings }, sourceSha256: validatedSource.metadata.sha256, promptSha256: await sha256Hex(new TextEncoder().encode(prompt)), prompt, resultPath }
}
