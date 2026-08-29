export const CREATURE_TRANSFORMATION_EXPERIMENTS_BUCKET = 'creature-transformation-experiments'

export type LineageStoragePathRow = Readonly<Record<string, unknown>>

const REMOVABLE_EXPERIMENT_PATH_PREFIXES = [
    'experiments/raw/',
    'candidates/',
    'cleanup/',
    'display/',
] as const

const PATH_FIELDS = [
    'asset_path',
    'display_asset_path',
    'raw_result_path',
    'result_path',
] as const

function isSafeStorageObjectPath(value: string): boolean {
    if (!value || value.startsWith('/')) return false
    return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
}

function isRemovableExperimentPath(value: string): boolean {
    return (
        isSafeStorageObjectPath(value) &&
        REMOVABLE_EXPERIMENT_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))
    )
}

/**
 * Returns only lineage-owned experiment objects. Canonical source objects intentionally do not
 * match any allowed prefix, even when a base visual version references them.
 */
export function collectLineageExperimentObjectPaths(rows: readonly LineageStoragePathRow[]): string[] {
    const paths = new Set<string>()

    for (const row of rows) {
        for (const field of PATH_FIELDS) {
            const value = row[field]
            if (typeof value === 'string' && isRemovableExperimentPath(value)) paths.add(value)
        }
    }

    return [...paths].sort()
}

/** Splits Storage API requests under its 1,000-object removal limit. */
export function splitStorageRemovalBatches(paths: readonly string[], batchSize = 1000): string[][] {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error('STORAGE_REMOVAL_BATCH_SIZE_INVALID')
    }

    const batches: string[][] = []
    for (let index = 0; index < paths.length; index += batchSize) {
        batches.push(paths.slice(index, index + batchSize))
    }

    return batches
}
