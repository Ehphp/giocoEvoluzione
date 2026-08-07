export type LegacyCreatureVisualVersion = Readonly<{
    id: string
    assetPath: string
    displayAssetPath?: string | null
    displayAssetSha256?: string | null
    displayMimeType?: string | null
    displayWidth?: number | null
    displayHeight?: number | null
}>

export type CreatureDisplayAssetBackfillCounts = Readonly<{
    processed: number
    skipped: number
    failed: number
}>

export function hasPersistedCreatureDisplayAsset(version: LegacyCreatureVisualVersion): boolean {
    return Boolean(
        version.displayAssetPath && /^display\/[a-f0-9]{64}\.webp$/.test(version.displayAssetPath)
        && version.displayAssetSha256 && /^[a-f0-9]{64}$/.test(version.displayAssetSha256)
        && version.displayMimeType === 'image/webp'
        && version.displayWidth && version.displayWidth >= 1 && version.displayWidth <= 768
        && version.displayHeight && version.displayHeight >= 1 && version.displayHeight <= 768,
    )
}

export async function backfillCreatureDisplayAssets(input: {
    versions: readonly LegacyCreatureVisualVersion[]
    dryRun?: boolean
    force?: boolean
    process: (version: LegacyCreatureVisualVersion, dryRun: boolean) => Promise<void>
    isComplete?: (version: LegacyCreatureVisualVersion) => boolean
    onFailure?: (version: LegacyCreatureVisualVersion, error: unknown) => void
}): Promise<CreatureDisplayAssetBackfillCounts> {
    let processed = 0
    let skipped = 0
    let failed = 0

    for (const version of input.versions) {
        if (!input.force && (input.isComplete?.(version) ?? hasPersistedCreatureDisplayAsset(version))) {
            skipped += 1
            continue
        }
        try {
            await input.process(version, input.dryRun === true)
            processed += 1
        } catch (error) {
            failed += 1
            input.onFailure?.(version, error)
        }
    }
    return { processed, skipped, failed }
}