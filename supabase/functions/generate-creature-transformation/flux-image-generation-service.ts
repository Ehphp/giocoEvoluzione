import type { ImageValidationProblem } from '../../../shared/creature-transformations/image-validator.ts'

/**
 * Failure vocabulary and framing envelope shared by the whole evolution generation path:
 * submission, the Fal callback and the finalizer all raise and read the same error class.
 *
 * The `FLUX_` and `FAL_FLUX_` code prefixes are persisted in `creature_transformation_requests`
 * and surfaced to the client, so they are kept verbatim even though the image provider is now
 * Seedream. Renaming them would invalidate every stored request row.
 */

/** How many framing retries a cropped subject earns before the generation fails for good. */
export const FLUX_MAX_CROP_RETRIES = 2
/** Minimum share of the canvas that must stay clear around the subject. */
export const FLUX_SUBJECT_MARGIN_RATIO = 0.06

/**
 * Includes every `FalFluxImageProviderErrorCode`, because a provider failure is rethrown as a
 * generation failure verbatim — the code reaches the client and the HTTP status mapper, so a code
 * missing here would silently fall through to the default status.
 */
export type FluxImageGenerationServiceErrorCode = 'FLUX_BODY_PLAN_UNSUPPORTED' | 'FLUX_SOURCE_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_UNCHANGED' | 'FLUX_SUBJECT_CROPPED' | 'FLUX_CONCEPT_NOT_CONFIGURED' | 'FLUX_CONCEPT_TIMEOUT' | 'FLUX_CONCEPT_PROVIDER_ERROR' | 'FLUX_CONCEPT_RESPONSE_INVALID' | 'SEEDREAM_CENTER_FACING' | 'FAL_FLUX_NOT_CONFIGURED' | 'FAL_FLUX_TIMEOUT' | 'FAL_FLUX_RATE_LIMITED' | 'FAL_FLUX_BAD_REQUEST' | 'FAL_FLUX_PROVIDER_ERROR' | 'FAL_FLUX_RESPONSE_INVALID' | 'FAL_SEEDREAM_MODEL_REQUIRED'

export class FluxImageGenerationServiceError extends Error {
    constructor(readonly code: FluxImageGenerationServiceErrorCode, message: string, readonly problems?: ImageValidationProblem[], options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'FluxImageGenerationServiceError'
    }
}
