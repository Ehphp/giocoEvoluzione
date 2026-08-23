import type { PlayerCreatureRecord, ProfileRecord } from '../../lib/profile-api'
import type { CreatureVisualVersionSource } from '../../components/creature-visual-progression/visual-versions'

export type CollectionForm = {
    id: string
    generation: number
    name: string
    image: string
    types: ReadonlyArray<'Natura' | 'Veleno' | 'Fuoco'>
    isUnlocked: boolean
    isActive: boolean
}

export type CollectionViewModel = {
    player: {
        name: string
        level: number
        experience: { current: number; required: number }
    }
    currentCreature: {
        name: string
        generation: number
        description: string
        image: string
        types: ReadonlyArray<'Natura' | 'Veleno' | 'Fuoco'>
    }
    evolutionForms: ReadonlyArray<CollectionForm>
}

export type CollectionViewModelInput = {
    profile: ProfileRecord
    creature: PlayerCreatureRecord
    experience: { current: number; required: number }
    visualUrl?: string | null
    visualVersionNumber?: number | null
    visualTrait?: string | null
    visualHistory?: ReadonlyArray<CreatureVisualVersionSource>
    currentVisualVersionId?: string | null
}
