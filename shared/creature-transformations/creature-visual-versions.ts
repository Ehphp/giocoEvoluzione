import type { CreatureTransformationConcept } from './concepts.ts'
import type { BodyArea } from './body-areas.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from './evolution-targets.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'
import type { VisualTraitId } from './visual-traits.ts'

export type CreatureVisualVersionStatus = 'BASE' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED'

export type PreviousCreatureTransformationSummary = Readonly<{
    versionNumber: number
    visualTraitId: VisualTraitId
    conceptName: string
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
    mutationArchetype?: MutationArchetype | null
    primaryBodyArea?: BodyArea | null
    supportingBodyAreas?: readonly BodyArea[]
}>

export type SelectableCreatureVisualVersion = Readonly<{
    id: string
    versionNumber: number
    visualTraitId: VisualTraitId | null
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
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
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
    conceptName: string | null
    conceptSnapshot: CreatureTransformationConcept | null
    promptTemplateVersion: string | null
    promptSha256: string | null
    assetSha256: string
    mimeType: 'image/png'
    width: number
    height: number
    hasAlpha: boolean
    displayAssetPath?: string | null
    displayAssetSha256?: string | null
    displayMimeType?: 'image/webp' | null
    displayWidth?: number | null
    displayHeight?: number | null
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
    mimeType: 'image/png' | 'image/webp'
    sha256: string
    isBaseVersion: boolean
}>
