export type DuelPlayerStatusV2 = 'choosing' | 'ready'

export type ModifierToneV2 = 'positive' | 'negative' | 'neutral'

export type GeneAffinityV2 = 'low' | 'medium' | 'high' | 'excellent'

export interface DuelPlayerV2 {
    id: string
    name: string
    score: number
    avatarUrl?: string
    status: DuelPlayerStatusV2
}

export interface RoundInfoV2 {
    current: number
    total: number
}

export interface EnvironmentModifierV2 {
    id: string
    label: string
    value: string
    tone: ModifierToneV2
}

export interface EnvironmentV2 {
    id: string
    name: string
    description: string
    imageUrl?: string
    modifiers: EnvironmentModifierV2[]
}

export interface GeneCardV2 {
    id: string
    name: string
    level: number
    affinity: GeneAffinityV2
    imageUrl?: string
    description: string
    predictedValue?: number
    disabled?: boolean
}

export interface GeneSelectionScreenDataV2 {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
    round: RoundInfoV2
    environment: EnvironmentV2
    genes: GeneCardV2[]
    selectedGeneId: string
    selectedAction: 'USE' | 'EVOLVE' | null
}
