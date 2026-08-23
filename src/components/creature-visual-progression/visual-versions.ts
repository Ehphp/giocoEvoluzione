import { withResolvedCreatureImage } from '../../ui/assets'

/**
 * Presentation-only representation of the unlocked visual lineage. Screens can select one of
 * these versions locally, but the active version remains owned by the progression API.
 */
export type CreatureVisualVersionSource = {
    id: string
    versionNumber: number
    visualTraitId: string | null
    conceptName: string | null
    signedUrl: string
}

export type CreatureVisualVersion = CreatureVisualVersionSource & {
    name: string
    isCurrent: boolean
}

type BuildCreatureVisualVersionsInput = {
    history?: ReadonlyArray<CreatureVisualVersionSource>
    currentVersionId?: string | null
    currentVersionNumber?: number | null
    fallback: CreatureVisualVersionSource
}

function formName(entry: CreatureVisualVersionSource) {
    return entry.conceptName ?? (entry.versionNumber === 1 ? 'Forma iniziale' : 'Forma evoluta')
}

/** Orders the unlocked lineage from oldest to newest and marks the persisted current version. */
export function buildCreatureVisualVersions({
    history,
    currentVersionId,
    currentVersionNumber,
    fallback,
}: BuildCreatureVisualVersionsInput): ReadonlyArray<CreatureVisualVersion> {
    const source = history?.length ? history : [fallback]
    const ordered = [...source].sort((first, second) => first.versionNumber - second.versionNumber || first.id.localeCompare(second.id))
    const currentId = currentVersionId && ordered.some((entry) => entry.id === currentVersionId)
        ? currentVersionId
        : ordered.find((entry) => entry.versionNumber === currentVersionNumber)?.id ?? ordered.at(-1)?.id

    return ordered.map((entry) => ({
        ...withResolvedCreatureImage(entry),
        name: formName(entry),
        isCurrent: entry.id === currentId,
    }))
}
