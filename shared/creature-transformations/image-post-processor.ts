import type { ValidatedPngMetadata } from './image-validator.ts'
import type { CreatureRenderSpecification } from './render-specifications.ts'

export type ImagePostProcessingInput = Readonly<{
    image: Uint8Array
    mimeType: 'image/png'
    metadata: ValidatedPngMetadata
    warnings: string[]
    renderSpecification: CreatureRenderSpecification
}>

export type ImagePostProcessingResult = {
    image: Uint8Array
    mimeType: 'image/png'
    warnings: string[]
}

export interface ImagePostProcessor {
    process(input: ImagePostProcessingInput): Promise<ImagePostProcessingResult>
}

export class ImagePostProcessingError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'ImagePostProcessingError'
    }
}

export class NoopImagePostProcessor implements ImagePostProcessor {
    async process(input: ImagePostProcessingInput): Promise<ImagePostProcessingResult> {
        return {
            image: input.image.slice(),
            mimeType: input.mimeType,
            warnings: [...input.warnings],
        }
    }
}
