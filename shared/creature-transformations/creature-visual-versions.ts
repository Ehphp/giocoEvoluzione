import type { BodyPlanMutationId } from './flux-evolution/body-plan-mutations.ts'
import type { FluxEvolutionSnapshot } from './flux-evolution/micro-concept.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from './evolution-targets.ts'
import type { VisualTraitId } from './visual-traits.ts'
import type { VisualInspection } from './visual-inspection.ts'

export type CreatureVisualVersionStatus = 'BASE' | 'ACTIVE' | 'SUPERSEDED' | 'REVOKED'

export type PreviousCreatureTransformationSummary = Readonly<{
    versionNumber: number
    visualTraitId: VisualTraitId
    conceptName: string
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
    /** The idea the evolution actually realised, used to continue it instead of replacing it. */
    mutationIdea?: string
    /** Set when this adopted version established a new canonical body plan. */
    bodyPlanMutationId?: BodyPlanMutationId
}>

/**
 * Snapshots persisted before the FLUX-only pipeline keep their original payload. They are read
 * as opaque history: nothing in the runtime interprets them as generation instructions.
 */
export type LegacyCreatureConceptSnapshot = Readonly<Record<string, unknown>>

export type CreatureTransformationConceptSnapshot = FluxEvolutionSnapshot | LegacyCreatureConceptSnapshot

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
    conceptSnapshot: CreatureTransformationConceptSnapshot | null
    promptTemplateVersion: string | null
    promptSha256: string | null
    /** Optional because visual versions created before the inspection rollout have no metadata. */
    visualInspection?: VisualInspection | null
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
