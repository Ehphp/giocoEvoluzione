import { describe, expect, it } from 'vitest'

import { createForegroundTestPng, createTestPng } from './image-test-fixtures.ts'
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

    it('accepts a valid native canvas when validating a canonical source image', async () => {
        const result = await validate(createTestPng({ width: 500, height: 500 }), { allowNonStandardDimensions: true })
        expect(result).toMatchObject({ valid: true, metadata: { width: 500, height: 500, hasAlpha: true } })
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

    it('rejects a RAW FLUX subject that reaches the safety area and accepts a safely framed subject', async () => {
        const renderSpecification = CURRENT_CREATURE_RENDER_SPECIFICATION
        const cropped = await new ImageValidator().validate({
            bytes: await createForegroundTestPng({ width: 1024, height: 1536, subject: { left: 0, top: 300, right: 700, bottom: 1200 } }),
            mimeType: 'image/png', renderSpecification, requireAlpha: false, requireSubjectMargin: 0.1,
        })
        expect(cropped).toMatchObject({ valid: false, problems: [{ code: 'FLUX_SUBJECT_CROPPED' }] })

        const safe = await new ImageValidator().validate({
            bytes: await createForegroundTestPng({ width: 1024, height: 1536, subject: { left: 120, top: 120, right: 900, bottom: 1400 } }),
            mimeType: 'image/png', renderSpecification, requireAlpha: false, requireSubjectMargin: 0.1,
        })
        expect(safe).toMatchObject({ valid: true, metadata: { foregroundBounds: { marginLeft: 120, marginTop: 120, marginRight: 123, marginBottom: 135 } } })
    })

})
