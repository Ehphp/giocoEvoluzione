import type { RoundEventDefinition, RoundEventEffect, TraitType } from './types.ts'

export const ROUND_EVENT_WEIGHT = 1

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
            { trait: 'FAT_RESERVES', modifier: 2, reason: 'Le riserve energetiche sostengono la sopravvivenza quando la cenere interrompe il foraggiamento.' },
            { trait: 'RESISTANCE', modifier: 1, reason: 'La tolleranza fisiologica riduce i danni causati dal particolato abrasivo.' },
            { trait: 'METABOLISM', modifier: 1, reason: 'La regolazione metabolica limita il consumo di risorse durante l esposizione prolungata.' },
            { trait: 'AGILITY', modifier: -1, reason: 'I movimenti rapidi sollevano altra cenere e aumentano l esposizione.' },
            { trait: 'PERCEPTION', modifier: -1, reason: 'La cenere sospesa riduce la lettura del territorio.' },
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
            { trait: 'ADAPTATION', modifier: 2, reason: 'La plasticita fenotipica permette di compensare rapidamente il lungo ciclo di oscurita.' },
            { trait: 'GRIP_CLAWS', modifier: 1, reason: 'Una presa stabile rende piu sicuri gli spostamenti quando i riferimenti visivi scompaiono.' },
            { trait: 'METABOLISM', modifier: -1, reason: 'Il buio prolungato altera i ritmi energetici regolati dalla luce.' },
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
            { trait: 'STRENGTH', modifier: 2, reason: 'La forza muscolare consente di respingere gli assalti ravvicinati del branco.' },
            { trait: 'AGILITY', modifier: 1, reason: 'Cambi di direzione rapidi aiutano a spezzare gli inseguimenti.' },
            { trait: 'PERCEPTION', modifier: 1, reason: 'I sensi acuti anticipano l avvicinamento coordinato dei predatori.' },
            { trait: 'CAMOUFLAGE', modifier: 1, reason: 'Il mimetismo riduce la probabilita di essere individuati dal branco.' },
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
            { trait: 'ADAPTATION', modifier: 1, reason: 'La plasticita fenotipica facilita una risposta rapida al calore persistente.' },
            { trait: 'WEBBED_LIMBS', modifier: 1, reason: 'Aree umide residue favoriscono mobilita anfibia.' },
            { trait: 'FAT_RESERVES', modifier: -1, reason: 'Accumulo adiposo peggiora dissipazione del calore.' },
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
            { trait: 'METABOLISM', modifier: 2, reason: 'Un metabolismo efficiente riduce il consumo energetico durante la scarsita nutritiva.' },
            { trait: 'ADAPTATION', modifier: 1, reason: 'Plasticita utile per cambiare dieta rapidamente.' },
            { trait: 'WEBBED_LIMBS', modifier: -1, reason: 'Arti specializzati per l acqua offrono poco vantaggio quando le risorse alimentari terrestri collassano.' },
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
            { trait: 'GRIP_CLAWS', modifier: 2, reason: 'Una presa salda sugli appigli evita di essere trascinati dalla corrente.' },
            { trait: 'STRENGTH', modifier: 1, reason: 'La forza aiuta a resistere alla spinta della corrente.' },
            { trait: 'WEBBED_LIMBS', modifier: 1, reason: 'Gli arti palmati migliorano la propulsione nei tratti sommersi.' },
            { trait: 'AGILITY', modifier: -1, reason: 'Movimenti elastici e leggeri perdono efficacia nell acqua impetuosa.' },
            { trait: 'FAT_RESERVES', modifier: -1, reason: 'La massa delle riserve adipose rallenta le correzioni contro una corrente improvvisa.' },
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
        throw new Error(`Unknown round event "${roundEventId}".`)
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
