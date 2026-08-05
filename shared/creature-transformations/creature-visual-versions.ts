import type { CreatureTransformationConcept } from './concepts.ts'
import type { VisualTraitId } from './visual-traits.ts'

export type CreatureVisualVersionStatus = 'BASE' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED'

export type PreviousCreatureTransformationSummary = Readonly<{
    versionNumber: number
    visualTraitId: VisualTraitId
    conceptName: string
}>

export type SelectableCreatureVisualVersion = Readonly<{
    id: string
    versionNumber: number
    visualTraitId: VisualTraitId | null
    conceptName: string | null
    signedUrl: string
    expiresAt: string
}>

export type CreatureVisualVersion = Readonly<{
    id: string
    creatureId: string
    versionNumber: number
    previousVersionId: string | null
    visualTraitId: VisualTraitId | null
    conceptName: string | null
    conceptSnapshot: CreatureTransformationConcept | null
    promptTemplateVersion: string | null
    promptSha256: string | null
    assetSha256: string
    mimeType: 'image/png'
    width: number
    height: number
    hasAlpha: boolean
    status: CreatureVisualVersionStatus
    adoptedAt: string | null
}>

export type CurrentCreatureVisualResponse = Readonly<{
    creatureId: string
    versionId: string
    versionNumber: number
    signedUrl: string
    expiresAt: string
    width: number
    height: number
    mimeType: 'image/png'
    sha256: string
    isBaseVersion: boolean
}>
