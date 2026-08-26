import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeBackground = vi.fn(async () => new Blob(['transparent'], { type: 'image/png' }))

vi.mock('@imgly/background-removal', () => ({ removeBackground }))

import { removeCreatureBackground } from './remove-creature-background'

describe('removeCreatureBackground', () => {
    beforeEach(() => {
        removeBackground.mockReset()
        removeBackground.mockResolvedValue(new Blob(['transparent'], { type: 'image/png' }))
    })

    it('uses the high-quality CPU model and preserves PNG output', async () => {
        await expect(removeCreatureBackground(new Blob(['raw'], { type: 'image/png' }))).resolves.toMatchObject({ type: 'image/png' })

        expect(removeBackground).toHaveBeenCalledWith(expect.any(Blob), {
            device: 'cpu',
            model: 'isnet',
            output: { format: 'image/png' },
        })
    })

    it('accepts a Seedream JPEG raw and still requires PNG output from the browser processor', async () => {
        await expect(removeCreatureBackground(new Blob(['raw'], { type: 'image/jpeg' }))).resolves.toMatchObject({ type: 'image/png' })
        expect(removeBackground).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }), expect.any(Object))
    })

    it('falls back to the FP16 model when the primary model fails', async () => {
        removeBackground.mockRejectedValueOnce(new Error('isnet allocation failed'))

        await expect(removeCreatureBackground(new Blob(['raw'], { type: 'image/png' }))).resolves.toMatchObject({ type: 'image/png' })

        expect(removeBackground).toHaveBeenCalledTimes(2)
        expect(removeBackground).toHaveBeenNthCalledWith(1, expect.any(Blob), {
            device: 'cpu',
            model: 'isnet',
            output: { format: 'image/png' },
        })
        expect(removeBackground).toHaveBeenNthCalledWith(2, expect.any(Blob), {
            device: 'cpu',
            model: 'isnet_fp16',
            output: { format: 'image/png' },
        })
    })

    it('keeps the final provider detail when both models fail', async () => {
        removeBackground.mockRejectedValueOnce(new Error('isnet allocation failed')).mockRejectedValueOnce(new Error('model download blocked'))

        await expect(removeCreatureBackground(new Blob(['raw'], { type: 'image/png' })))
            .rejects.toThrow('La rimozione dello sfondo non e riuscita. Dettaglio: model download blocked')
    })
})
