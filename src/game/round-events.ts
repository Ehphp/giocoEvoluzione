import type { RoundEventDefinition, RoundEventEffect, TraitType } from './types'

export const ROUND_EVENT_WEIGHT = 2

export const ROUND_EVENT_DEFINITIONS: RoundEventDefinition[] = [
    {
        id: 'VOLCANIC_ASH_WAVE',
        title: 'Ondata di ceneri vulcaniche',
        shortDescription: 'Particelle abrasive e visibilita ridotta.',
        category: 'GEOLOGICAL',
        rarity: 'UNCOMMON',
        intensity: 2,
        artKey: 'event-volcanic-ash-wave',
        tags: ['placeholder', 'abrasion', 'air-quality'],
        effects: [
            { trait: 'RESISTANCE', modifier: 2, reason: 'La pelle isolante limita danni da particolato.' },
            { trait: 'PERCEPTION', modifier: -1, reason: 'La cenere sospesa riduce lettura del territorio.' },
            { trait: 'METABOLISM', modifier: -1, reason: 'Respirazione piu costosa in aria pesante.' },
        ],
    },
    {
        id: 'PROLONGED_ECLIPSE',
        title: 'Eclissi prolungata',
        shortDescription: 'Luce minima e orientamento instabile.',
        category: 'ASTRONOMICAL',
        rarity: 'RARE',
        intensity: 3,
        artKey: 'event-prolonged-eclipse',
        tags: ['placeholder', 'darkness'],
        effects: [
            { trait: 'PERCEPTION', modifier: 2, reason: 'I sensi acuti mantengono vantaggio in scarsa luce.' },
            { trait: 'CAMOUFLAGE', modifier: 1, reason: 'L ombra diffusa migliora occultamento.' },
            { trait: 'STRENGTH', modifier: -1, reason: 'Ingaggi diretti meno frequenti in buio profondo.' },
        ],
    },
    {
        id: 'PREDATOR_PACK_MIGRATION',
        title: 'Migrazione di predatori',
        shortDescription: 'La catena trofica entra in pressione.',
        category: 'BIOLOGICAL',
        rarity: 'COMMON',
        intensity: 2,
        artKey: 'event-predator-pack-migration',
        tags: ['placeholder', 'predators', 'threat'],
        effects: [
            { trait: 'AGILITY', modifier: 2, reason: 'La fuga rapida riduce esposizione agli inseguimenti.' },
            { trait: 'CAMOUFLAGE', modifier: 2, reason: 'Mimetismo efficace contro pattugliamenti predatori.' },
            { trait: 'FAT_RESERVES', modifier: -1, reason: 'Maggiore massa penalizza cambi direzione rapidi.' },
        ],
    },
    {
        id: 'HEAT_SPIKE',
        title: 'Picco termico persistente',
        shortDescription: 'Calore costante e consumo energetico alto.',
        category: 'CLIMATE',
        rarity: 'COMMON',
        intensity: 2,
        artKey: 'event-heat-spike',
        tags: ['placeholder', 'temperature', 'stress'],
        effects: [
            { trait: 'METABOLISM', modifier: 2, reason: 'Gestione energetica piu efficiente sotto stress termico.' },
            { trait: 'WEBBED_LIMBS', modifier: 1, reason: 'Aree umide residue favoriscono mobilita anfibia.' },
            { trait: 'FAT_RESERVES', modifier: -2, reason: 'Accumulo adiposo peggiora dissipazione del calore.' },
        ],
    },
    {
        id: 'NUTRIENT_COLLAPSE',
        title: 'Collasso risorse nutritive',
        shortDescription: 'Scarsita estesa nelle zone di foraggiamento.',
        category: 'ECOLOGICAL',
        rarity: 'UNCOMMON',
        intensity: 3,
        artKey: 'event-nutrient-collapse',
        tags: ['placeholder', 'food', 'scarcity'],
        effects: [
            { trait: 'METABOLISM', modifier: 2, reason: 'Metabolismo efficiente mantiene attivita con poche risorse.' },
            { trait: 'ADAPTATION', modifier: 1, reason: 'Plasticita utile per cambiare dieta rapidamente.' },
            { trait: 'STRENGTH', modifier: -1, reason: 'Mantenere massa muscolare richiede energia rara.' },
        ],
    },
    {
        id: 'FLASH_FLOOD',
        title: 'Inondazione lampo',
        shortDescription: 'Canali rapidi e terreno allagato.',
        category: 'ECOLOGICAL',
        rarity: 'COMMON',
        intensity: 1,
        artKey: 'event-flash-flood',
        tags: ['placeholder', 'water', 'mobility'],
        effects: [
            { trait: 'WEBBED_LIMBS', modifier: 2, reason: 'Gli arti palmati dominano i tratti sommersi.' },
            { trait: 'GRIP_CLAWS', modifier: 1, reason: 'Presa su appigli instabili durante la corrente.' },
            { trait: 'STRENGTH', modifier: -1, reason: 'La forza frontale rende meno in acqua veloce.' },
        ],
    },
]

const ROUND_EVENT_BY_ID = ROUND_EVENT_DEFINITIONS.reduce<Record<string, RoundEventDefinition>>((accumulator, eventDefinition) => {
    accumulator[eventDefinition.id] = eventDefinition

    return accumulator
}, {})

export function getRoundEventById(roundEventId: string): RoundEventDefinition {
    const roundEvent = ROUND_EVENT_BY_ID[roundEventId]

    if (!roundEvent) {
        throw new Error(`Unknown round event \"${roundEventId}\".`)
    }

    return roundEvent
}

export function getRoundEventForRound(sequence: string[], roundNumber: number): RoundEventDefinition | null {
    const eventId = sequence[roundNumber - 1]

    if (!eventId) {
        return null
    }

    return getRoundEventById(eventId)
}

function normalizeEffects(effects: RoundEventEffect[]): RoundEventEffect[] {
    return effects.filter((effect) => Number.isFinite(effect.modifier) && effect.reason.trim().length > 0)
}

export function getRoundEventEffectsForTrait(roundEvent: RoundEventDefinition, trait: TraitType): RoundEventEffect[] {
    return normalizeEffects(roundEvent.effects).filter((effect) => effect.trait === trait)
}

function shuffleIds(ids: string[], random: () => number): string[] {
    const clone = [...ids]

    for (let index = clone.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1))
        const current = clone[index]
        clone[index] = clone[swapIndex] ?? clone[index]
        clone[swapIndex] = current
    }

    return clone
}

export function generateRoundEventSequence(totalRounds = 6, random: () => number = Math.random): string[] {
    const catalogIds = ROUND_EVENT_DEFINITIONS.map((eventDefinition) => eventDefinition.id)

    if (catalogIds.length === 0) {
        throw new Error('Round event catalog is empty.')
    }

    if (totalRounds <= catalogIds.length) {
        return shuffleIds(catalogIds, random).slice(0, totalRounds)
    }

    const sequence: string[] = []

    while (sequence.length < totalRounds) {
        const shuffled = shuffleIds(catalogIds, random)

        for (const eventId of shuffled) {
            if (sequence.length >= totalRounds) {
                break
            }

            if (sequence.includes(eventId)) {
                continue
            }

            sequence.push(eventId)
        }

        if (sequence.length < totalRounds && sequence.length === catalogIds.length) {
            // No more unique events available; allow extension by reshuffling.
            const extension = shuffled.filter((eventId) => sequence[sequence.length - 1] !== eventId)
            sequence.push(...extension.slice(0, totalRounds - sequence.length))
        }
    }

    return sequence.slice(0, totalRounds)
}
