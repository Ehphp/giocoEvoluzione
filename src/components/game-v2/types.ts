import type { TraitType } from '../../game/types'
import type { CreatureVisual } from './gameSelectionAssets'

export type DuelPlayerStatusV2 = 'choosing' | 'ready' | 'disconnected'

/** Presentation-only state of one equipped mutation in the battle header. */
export type CombatMutationVisualStateV2 = 'available' | 'armed' | 'consumed'

export type CombatMutationSlotV2 = {
    id: string
    label: string
    shortDescription: string
    iconKey: string
    status: CombatMutationVisualStateV2
}

export type ModifierToneV2 = 'positive' | 'negative' | 'neutral'

export type GeneAffinityV2 = 'unfavorable' | 'suitable' | 'ideal'

export type GeneActionTypeV2 = 'USE' | 'EVOLVE'

export type GeneSelectionStatusV2 = 'loading' | 'choosing' | 'submitting' | 'waiting' | 'resolving' | 'error' | 'invalid'

export interface DuelPlayerV2 {
    id: string
    name: string
    score: number
    roundValueTotal: number | null
    avatarUrl?: string
    creatureVisual?: CreatureVisual | null
    /** Ordered match loadout, mapped by the controller from the authoritative snapshot. */
    combatMutations?: CombatMutationSlotV2[]
    status: DuelPlayerStatusV2
}

export interface RoundInfoV2 {
    current: number
    total: number
}

export interface RoundEventEffectV2 {
    id: string
    label: string
    modifier: number
    value: string
    tone: ModifierToneV2
}

export interface RoundEventV2 {
    id: string
    title: string
    description: string
    imageUrl?: string
    effects: RoundEventEffectV2[]
}

export interface GeneCardV2 {
    id: string
    traitType: TraitType
    name: string
    level: number
    affinity: GeneAffinityV2
    imageUrl?: string
    usable: boolean
    exhausted: boolean
    strongAgainst: string
    weakAgainst: string
    disabledReason?: string
    prediction?: {
        useScore: number
        baseContribution: number
        levelContribution: number
        eventModifier: number
        mutationBonus?: number
        reasons: string[]
    }
    mutationHints?: string[]
    evolvePrediction?: { score: number; mutationBonus?: number }
    evolveMutationHints?: string[]
}

export interface WaitingStateV2 {
    submittedGeneName: string
    submittedAction: GeneActionTypeV2
    submittedCountLabel: string
    opponentStatusLabel: string
    isResolving: boolean
}

export interface GeneSelectionViewModelV2 {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
    round: RoundInfoV2
    roundEvent: RoundEventV2
    nextRoundEvent: RoundEventV2 | null
    genes: GeneCardV2[]
    selectedGeneId: string | null
    selectedAction: GeneActionTypeV2 | null
    selectedGene: GeneCardV2 | null
    status: GeneSelectionStatusV2
    actionsSubmitted: number
    canUse: boolean
    canEvolve: boolean
    canSelectGenes: boolean
    errorMessage?: string
    invalidReason?: string
    waitingState?: WaitingStateV2
}
