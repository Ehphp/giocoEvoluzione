import { describe, expect, it } from 'vitest'

import { flipRgbaImageHorizontally } from './horizontal-image-flip.ts'

describe('flipRgbaImageHorizontally', () => {
    it('mirrors pixels once while preserving the canvas dimensions and alpha channel', () => {
        const input = new Uint8ClampedArray([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        ])

        const result = flipRgbaImageHorizontally({ data: input, width: 3, height: 2 })

        expect(result).toMatchObject({ width: 3, height: 2 })
        expect([...result.data]).toEqual([
            9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4, 21, 22, 23, 24, 17, 18, 19, 20, 13, 14, 15, 16,
        ])
        expect([...input]).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        ])
    })
})
