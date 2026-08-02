import { describe, expect, it } from 'vitest'

import { createTestPng } from './image-test-fixtures.ts'
import { NoopImagePostProcessor } from './image-post-processor.ts'

describe('NoopImagePostProcessor', () => {
    it('copies bytes and preserves incoming warnings without claiming a visual transformation', async () => {
        const image = createTestPng()
        const result = await new NoopImagePostProcessor().process({
            image,
            mimeType: 'image/png',
            metadata: { mimeType: 'image/png', width: 1024, height: 1536, colorType: 6, hasAlpha: true, sha256: 'hash', bytes: image.length },
            warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
            renderSpecification: { version: 'sprite-1024x1536-v1', width: 1024, height: 1536, outputMimeType: 'image/png', transparentBackground: true, preservePose: true, preserveComposition: true, preserveCanvasMargins: true },
        })

        expect(result.image).toEqual(image)
        expect(result.image).not.toBe(image)
        expect(result.warnings).toEqual(['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'])
    })
})
