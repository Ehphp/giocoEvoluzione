import { afterEach, describe, expect, it, vi } from 'vitest'

import { CREATURE_MASTER_DIMENSIONS, getNormalizedCreatureMasterDimensions, normalizeCreatureMasterPng } from './normalize-creature-master'

afterEach(() => vi.unstubAllGlobals())

describe('getNormalizedCreatureMasterDimensions', () => {
    it('normalizes the FLUX 768x1152 canvas to the existing 1024x1536 master without changing ratio', () => {
        expect(getNormalizedCreatureMasterDimensions(768, 1152)).toEqual(CREATURE_MASTER_DIMENSIONS)
        expect(768 / 1152).toBe(1024 / 1536)
    })

    it('rejects a non-2:3 source instead of distorting alpha pixels', () => {
        expect(() => getNormalizedCreatureMasterDimensions(768, 1024)).toThrow(/2:3/)
    })

    it('renders a transparent PNG canvas at the canonical dimensions', async () => {
        const clearRect = vi.fn()
        const drawImage = vi.fn()
        const close = vi.fn()
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 768, height: 1152, close })))
        class TestCanvas {
            readonly width: number
            readonly height: number
            constructor(width: number, height: number) { this.width = width; this.height = height }
            getContext() { return { clearRect, drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' } }
            async convertToBlob(options: BlobPropertyBag) { return new Blob(['transparent-alpha-preserved'], options) }
        }
        vi.stubGlobal('OffscreenCanvas', TestCanvas)

        const result = await normalizeCreatureMasterPng(new Blob(['raw'], { type: 'image/png' }))

        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 1536)
        expect(clearRect).toHaveBeenCalledWith(0, 0, 1024, 1536)
        expect(result.type).toBe('image/png')
        expect(close).toHaveBeenCalledOnce()
    })
})
