import { describe, expect, it, vi } from 'vitest'

import { backfillCreatureDisplayAssets, type LegacyCreatureVisualVersion } from './display-asset-backfill.ts'

const LEGACY: LegacyCreatureVisualVersion = { id: 'legacy', assetPath: 'verdant-hatchling-v1.png' }
const COMPLETE: LegacyCreatureVisualVersion = {
    id: 'complete',
    assetPath: 'cleanup/a.png',
    displayAssetPath: `display/${'a'.repeat(64)}.webp`,
    displayAssetSha256: 'b'.repeat(64),
    displayMimeType: 'image/webp',
    displayWidth: 512,
    displayHeight: 768,
}

describe('creature display asset backfill', () => {
    it('processes a legacy visual version without a display asset', async () => {
        const process = vi.fn(async () => undefined)

        await expect(backfillCreatureDisplayAssets({ versions: [LEGACY], process })).resolves.toEqual({
            processed: 1,
            skipped: 0,
            failed: 0,
        })
        expect(process).toHaveBeenCalledWith(LEGACY, false)
    })

    it('skips a visual version with a complete persisted display asset', async () => {
        const process = vi.fn(async () => undefined)

        await expect(backfillCreatureDisplayAssets({ versions: [COMPLETE], process })).resolves.toEqual({
            processed: 0,
            skipped: 1,
            failed: 0,
        })
        expect(process).not.toHaveBeenCalled()
    })

    it('processes a complete metadata record when its storage object is missing', async () => {
        const process = vi.fn(async () => undefined)

        await expect(
            backfillCreatureDisplayAssets({ versions: [COMPLETE], process, isComplete: () => false }),
        ).resolves.toEqual({ processed: 1, skipped: 0, failed: 0 })
        expect(process).toHaveBeenCalledWith(COMPLETE, false)
    })

    it('continues after a per-version failure', async () => {
        const second: LegacyCreatureVisualVersion = { id: 'second', assetPath: 'cleanup/second.png' }
        const process = vi.fn(async (version: LegacyCreatureVisualVersion) => {
            if (version.id === LEGACY.id) throw new Error('storage unavailable')
        })
        const onFailure = vi.fn()

        await expect(
            backfillCreatureDisplayAssets({ versions: [LEGACY, second], process, onFailure }),
        ).resolves.toEqual({ processed: 1, skipped: 0, failed: 1 })
        expect(process).toHaveBeenCalledTimes(2)
        expect(onFailure).toHaveBeenCalledWith(LEGACY, expect.any(Error))
    })

    it('is idempotent on a repeated run after persistence', async () => {
        const records: LegacyCreatureVisualVersion[] = [{ ...LEGACY }]
        const process = vi.fn(async (version: LegacyCreatureVisualVersion) => {
            const index = records.findIndex((record) => record.id === version.id)
            records[index] = { ...records[index], ...COMPLETE }
        })

        await expect(backfillCreatureDisplayAssets({ versions: records, process })).resolves.toEqual({
            processed: 1,
            skipped: 0,
            failed: 0,
        })
        await expect(backfillCreatureDisplayAssets({ versions: records, process })).resolves.toEqual({
            processed: 0,
            skipped: 1,
            failed: 0,
        })
        expect(process).toHaveBeenCalledTimes(1)
    })
})
