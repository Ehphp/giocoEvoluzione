export type FalQueueSource = Readonly<{
    kind: 'CANONICAL' | 'EXPERIMENTAL' | 'VISUAL'
    path: string
    isBaseVersion: boolean
}>

export type SeedreamProductionParameters = Readonly<{
    imageSize: Readonly<{ width: number; height: number }>
}>

export type FalQueueWorkflow = Readonly<{
    version: 1
    kind: 'SEEDREAM_PRODUCTION'
    source: FalQueueSource
    parameters: SeedreamProductionParameters
}>

function object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function source(value: unknown): FalQueueSource | null {
    const item = object(value)
    if (
        !item ||
        (item.kind !== 'CANONICAL' && item.kind !== 'EXPERIMENTAL' && item.kind !== 'VISUAL') ||
        typeof item.path !== 'string' ||
        !item.path ||
        item.path.length > 512 ||
        typeof item.isBaseVersion !== 'boolean'
    )
        return null
    return Object.freeze({ kind: item.kind, path: item.path, isBaseVersion: item.isBaseVersion })
}

/**
 * Production submissions carry an explicit pixel size and nothing else: the optional provider
 * knobs (seed, image count, sync mode, safety checker) belonged to the retired diagnostic
 * workflow, so persisted metadata that still sets any of them is rejected rather than coerced.
 */
function productionParameters(value: unknown): SeedreamProductionParameters | null {
    const item = object(value)
    if (!item || !('imageSize' in item)) return null
    const size = object(item.imageSize)
    if (!size || typeof size.width !== 'number' || !Number.isInteger(size.width) || size.width <= 0) return null
    if (typeof size.height !== 'number' || !Number.isInteger(size.height) || size.height <= 0) return null
    if (
        item.numImages !== undefined ||
        item.maxImages !== undefined ||
        item.seed !== undefined ||
        item.syncMode !== undefined ||
        item.enableSafetyChecker !== undefined
    )
        return null
    return Object.freeze({ imageSize: Object.freeze({ width: size.width, height: size.height }) })
}

export function parseFalQueueWorkflow(value: unknown): FalQueueWorkflow | null {
    const item = object(value)
    if (!item || item.version !== 1 || item.kind !== 'SEEDREAM_PRODUCTION') return null
    const parsedSource = source(item.source)
    const parsedParameters = productionParameters(item.parameters)
    return parsedSource && parsedParameters
        ? Object.freeze({ version: 1, kind: 'SEEDREAM_PRODUCTION', source: parsedSource, parameters: parsedParameters })
        : null
}
