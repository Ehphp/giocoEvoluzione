import { describe, expect, it } from 'vitest'

import { createTestPng } from './image-test-fixtures.ts'
import { ImageValidator } from './image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from './render-specifications.ts'

function validate(bytes: Uint8Array, options: Partial<Parameters<ImageValidator['validate']>[0]> = {}) {
    return new ImageValidator().validate({ bytes, mimeType: 'image/png', renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, ...options })
}

describe('ImageValidator', () => {
    it('accepts a structurally valid 1024x1536 PNG with alpha and SHA-256 metadata', async () => {
        const result = await validate(createTestPng())
        expect(result).toMatchObject({ valid: true, metadata: { width: 1024, height: 1536, colorType: 6, hasAlpha: true, mimeType: 'image/png' } })
        if (result.valid) expect(result.metadata.sha256).toMatch(/^[a-f0-9]{64}$/)
    })

    it('rejects invalid signatures, missing IHDR, wrong dimensions, missing alpha, empty and oversized data', async () => {
        const badSignature = createTestPng()
        badSignature[0] = 0
        await expect(validate(badSignature)).resolves.toMatchObject({ valid: false, problems: [{ code: 'PNG_SIGNATURE_INVALID' }] })
        const missingIhdr = await validate(createTestPng({ includeIhdr: false }), { minBytes: 1 })
        expect(missingIhdr.valid).toBe(false)
        if (!missingIhdr.valid) expect(missingIhdr.problems.some((entry) => entry.code === 'PNG_IHDR_MISSING')).toBe(true)
        await expect(validate(createTestPng({ width: 1 }))).resolves.toMatchObject({ valid: false, problems: [{ code: 'PNG_DIMENSIONS_INVALID' }] })
        await expect(validate(createTestPng({ colorType: 2 }))).resolves.toMatchObject({ valid: false, problems: [{ code: 'PNG_ALPHA_REQUIRED' }] })
        await expect(validate(new Uint8Array())).resolves.toMatchObject({ valid: false, problems: [{ code: 'IMAGE_EMPTY' }, { code: 'PNG_SIGNATURE_INVALID' }] })
        await expect(validate(createTestPng(), { maxBytes: 64 })).resolves.toMatchObject({ valid: false, problems: [{ code: 'PNG_BYTES_TOO_LARGE' }] })
    })

    it('treats identical mock output as a warning and identical real output as an error', async () => {
        const source = createTestPng()
        const sourceResult = await validate(source)
        if (!sourceResult.valid) throw new Error('Fixture PNG must validate.')

        await expect(validate(source.slice(), { sourceSha256: sourceResult.metadata.sha256, isMock: true })).resolves.toMatchObject({ valid: true, warnings: ['RESULT_IMAGE_UNCHANGED_MOCK'] })
        await expect(validate(source.slice(), { sourceSha256: sourceResult.metadata.sha256, isMock: false })).resolves.toMatchObject({ valid: false, problems: [{ code: 'RESULT_IMAGE_UNCHANGED' }] })

        const changed = source.slice()
        changed[48] = 42
        await expect(validate(changed, { sourceSha256: sourceResult.metadata.sha256, isMock: false })).resolves.toMatchObject({ valid: true, warnings: [] })
    })

    it('accepts a provider raw PNG without alpha as experiment-only input while preserving final alpha requirements', async () => {
        const withoutAlpha = createTestPng({ colorType: 2 })
        await expect(validate(withoutAlpha, { profile: 'PROVIDER_RAW_RESULT' })).resolves.toMatchObject({
            valid: true,
            metadata: { hasAlpha: false },
            warnings: ['RAW_RESULT_ALPHA_MISSING'],
        })
        await expect(validate(withoutAlpha, { profile: 'FINAL_CREATURE_ASSET' })).resolves.toMatchObject({
            valid: false,
            problems: [{ code: 'PNG_ALPHA_REQUIRED' }],
        })
    })
})
