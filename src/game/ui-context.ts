import { TRAIT_LABELS } from './config'
import type { RoundEventDefinition, TraitCollection, TraitType } from './types'

export type PressureLevel = 'Bassa' | 'Media' | 'Alta' | 'Molto alta'

export type RoundEventPressure = {
    id: string
    label: string
    intensity: PressureLevel
    score: number
    reason: string
}

export type TraitTradeoffMock = {
    survivalShift: string
    mobilityShift: string
    unlockedResource: string
    compromise: string
}

const TRAIT_TRADEOFFS: Record<TraitType, TraitTradeoffMock> = {
    STRENGTH: {
        survivalShift: '+8% in scontri diretti',
        mobilityShift: '-4% in mobilita fine',
        unlockedResource: 'Carcasse ad alto valore',
        compromise: 'Costo energetico maggiore',
    },
    RESISTANCE: {
        survivalShift: '+10% in stress ambientale',
        mobilityShift: '-3% in accelerazione',
        unlockedResource: 'Zone esposte al clima estremo',
        compromise: 'Crescita evolutiva piu lenta',
    },
    AGILITY: {
        survivalShift: '+6% in fuga e inseguimento',
        mobilityShift: '+7% in terreni complessi',
        unlockedResource: 'Passaggi stretti',
        compromise: 'Minore impatto in scontro frontale',
    },
    PERCEPTION: {
        survivalShift: '+7% in anticipo minacce',
        mobilityShift: '+2% in percorso efficiente',
        unlockedResource: 'Risorse nascoste',
        compromise: 'Dipendenza da linee visive',
    },
    METABOLISM: {
        survivalShift: '+9% con cibo scarso',
        mobilityShift: '-2% in sprint prolungati',
        unlockedResource: 'Nutrienti a bassa qualita',
        compromise: 'Picco forza immediato ridotto',
    },
    ADAPTATION: {
        survivalShift: '+8% in biomi variabili',
        mobilityShift: '+3% transizione bioma',
        unlockedResource: 'Zone ibride e marginali',
        compromise: 'Specializzazione pura piu lenta',
    },
    GRIP_CLAWS: {
        survivalShift: '+7% su superfici verticali',
        mobilityShift: '+5% su rocce e tronchi',
        unlockedResource: 'Nidi elevati e pareti',
        compromise: 'Rende meno in terreno fangoso',
    },
    CAMOUFLAGE: {
        survivalShift: '+8% in occultamento',
        mobilityShift: '+2% in avvicinamento cauto',
        unlockedResource: 'Aree ad alta copertura',
        compromise: 'Impatto diretto ridotto',
    },
    WEBBED_LIMBS: {
        survivalShift: '+9% in acqua bassa',
        mobilityShift: '+6% su fango e lagune',
        unlockedResource: 'Canali e zone allagate',
        compromise: 'Meno trazione su roccia asciutta',
    },
    FAT_RESERVES: {
        survivalShift: '+8% in freddo e carestia',
        mobilityShift: '-2% in sprint prolungati',
        unlockedResource: 'Fasi lunghe senza nutrimento',
        compromise: 'Picco reattivo leggermente minore',
    },
}

function levelFromScore(score: number): PressureLevel {
    if (score >= 3) {
        return 'Molto alta'
    }

    if (score >= 2) {
        return 'Alta'
    }

    if (score >= 1) {
        return 'Media'
    }

    return 'Bassa'
}

export function getRoundEventLabel(roundEvent: RoundEventDefinition | null): string {
    if (!roundEvent) {
        return 'Evento non disponibile'
    }

    return roundEvent.title
}

export function getRoundEventPressures(roundEvent: RoundEventDefinition | null): RoundEventPressure[] {
    if (!roundEvent) {
        return []
    }

    return roundEvent.effects.map((effect, index) => {
        const score = Math.min(4, Math.max(0, Math.round(Math.abs(effect.modifier) + 1)))

        return {
            id: `${roundEvent.id}-${effect.trait}-${index}`,
            label: TRAIT_LABELS[effect.trait],
            intensity: levelFromScore(score),
            score,
            reason: effect.reason,
        }
    })
}

export function getFavoredAndPenalizedTraits(roundEvent: RoundEventDefinition | null): { favored: string[]; penalized: string[] } {
    if (!roundEvent) {
        return { favored: [], penalized: [] }
    }

    const sorted = [...roundEvent.effects].sort((left, right) => right.modifier - left.modifier)

    return {
        favored: sorted.filter((effect) => effect.modifier > 0).slice(0, 2).map((effect) => TRAIT_LABELS[effect.trait]),
        penalized: sorted.filter((effect) => effect.modifier < 0).slice(0, 2).map((effect) => TRAIT_LABELS[effect.trait]),
    }
}

export function getTraitTradeoffMock(trait: TraitType | null): TraitTradeoffMock | null {
    if (!trait) {
        return null
    }

    return TRAIT_TRADEOFFS[trait]
}

export function calculateAdaptationIndex(roundEvent: RoundEventDefinition | null, traits: TraitCollection | null, score: number): number {
    if (!roundEvent || !traits) {
        return score * 8
    }

    const effectsByTrait = roundEvent.effects.reduce<Record<TraitType, number>>((accumulator, effect) => {
        accumulator[effect.trait] = (accumulator[effect.trait] ?? 0) + effect.modifier

        return accumulator
    }, {} as Record<TraitType, number>)

    const weighted = (Object.entries(traits) as Array<[TraitType, { level: number }]>)
        .reduce((sum, [trait, state]) => sum + state.level * ((effectsByTrait[trait] ?? 0) + 1), 0)

    return score * 8 + weighted
}
