import { describe, expect, it } from 'vitest'
import {
    collectLineageExperimentObjectPaths,
    splitStorageRemovalBatches,
} from './lineage-storage-cleanup'

describe('lineage Storage cleanup', () => {
    it('collects only deduplicated experiment objects and never a canonical source asset', () => {
        const paths = collectLineageExperimentObjectPaths([
            {
                asset_path: 'verdant-hatchling/base.png',
                display_asset_path: 'display/display-hash.webp',
                result_path: 'candidates/profile-1/candidate-hash.png',
            },
            {
                asset_path: 'candidates/profile-1/candidate-hash.png',
                raw_result_path: 'experiments/raw/profile-1/raw-hash.jpg',
                result_path: 'cleanup/legacy-cleanup-hash.png',
            },
            {
                asset_path: 'candidates/../shared.png',
                display_asset_path: '/display/absolute.webp',
            },
        ])

        expect(paths).toEqual([
            'candidates/profile-1/candidate-hash.png',
            'cleanup/legacy-cleanup-hash.png',
            'display/display-hash.webp',
            'experiments/raw/profile-1/raw-hash.jpg',
        ])
    })

    it('keeps each Storage API removal batch at or below one thousand objects', () => {
        const paths = Array.from({ length: 1001 }, (_, index) => `display/${index}.webp`)

        expect(splitStorageRemovalBatches(paths).map((batch) => batch.length)).toEqual([1000, 1])
        expect(() => splitStorageRemovalBatches(paths, 1001)).toThrow('STORAGE_REMOVAL_BATCH_SIZE_INVALID')
    })
})
