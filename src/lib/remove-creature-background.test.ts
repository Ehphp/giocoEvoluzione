import { describe, expect, it, vi } from 'vitest'

const removeBackground = vi.fn(async () => new Blob(['transparent'], { type: 'image/png' }))

vi.mock('@imgly/background-removal', () => ({ removeBackground }))

import { removeCreatureBackground } from './remove-creature-background'

describe('removeCreatureBackground', () => {
    it('uses the high-quality CPU model and preserves PNG output', async () => {
        await expect(removeCreatureBackground(new Blob(['raw'], { type: 'image/png' }))).resolves.toMatchObject({ type: 'image/png' })

        expect(removeBackground).toHaveBeenCalledWith(expect.any(Blob), {
            device: 'cpu',
            model: 'isnet_fp16',
            output: { format: 'image/png' },
        })
    })
})