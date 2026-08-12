import { ASSETS } from '../../ui/assets'
import type { CollectionForm, CollectionViewModel, CollectionViewModelInput } from './types'

/* Elemental types are presentation placeholders until the profile API exposes them. */
const PLACEHOLDER_TYPES: ReadonlyArray<'Natura'> = ['Natura']

export function buildCollectionViewModel({
    profile,
    creature,
    experience,
    visualUrl,
    visualVersionNumber,
    visualTrait,
    visualHistory,
    currentVisualVersionId,
}: CollectionViewModelInput): CollectionViewModel {
    const activeGeneration = visualVersionNumber ?? 1
    const fallbackImage = visualUrl ?? ASSETS.creatures.player
    const forms: CollectionForm[] = (visualHistory?.length ? visualHistory : [{
        id: creature.id,
        versionNumber: activeGeneration,
        visualTraitId: visualTrait ?? null,
        conceptName: null,
        signedUrl: fallbackImage,
    }]).map((entry) => ({
        id: entry.id,
        generation: entry.versionNumber,
        name: entry.conceptName ?? (entry.versionNumber === 1 ? 'Forma iniziale' : 'Forma evoluta'),
        image: entry.signedUrl,
        types: PLACEHOLDER_TYPES,
        isUnlocked: true,
        isActive: entry.id === currentVisualVersionId || entry.versionNumber === activeGeneration,
    }))
    const activeForm = forms.find((form) => form.isActive) ?? forms.at(-1)!

    return {
        player: { name: profile.nickname, level: creature.level, experience },
        currentCreature: {
            name: creature.name ?? 'Creatura iniziale',
            generation: activeForm.generation,
            description: activeForm.name === 'Forma iniziale' ? 'La prima forma della tua stirpe.' : 'La forma più evoluta raggiunta finora.',
            image: visualUrl ?? activeForm.image ?? fallbackImage,
            types: activeForm.types,
        },
        evolutionForms: forms,
    }
}
