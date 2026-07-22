import { ENVIRONMENT_MODIFIERS, TRAIT_LABELS } from './config'
import type { Environment, TraitCollection, TraitType } from './types'

export type PressureLevel = 'Bassa' | 'Media' | 'Alta' | 'Molto alta'

export type EnvironmentPressure = {
    id: string
    label: string
    intensity: PressureLevel
    score: number
}

export type EnvironmentEventMock = {
    title: string
    detail: string
    kind: 'flood' | 'drought' | 'cold' | 'predators' | 'resource'
    isMock: true
}

export type HabitatZone = {
    id: string
    label: string
    control: 'player' | 'opponent' | 'neutral' | 'hazard'
}

export type TraitTradeoffMock = {
    survivalShift: string
    mobilityShift: string
    unlockedResource: string
    compromise: string
}

const BIOME_LABELS: Record<Environment, string> = {
    FOREST: 'Foresta fitta',
    MOUNTAIN: 'Catena montana',
    SWAMP: 'Palude tropicale',
}

const PRESSURE_LABELS: Record<Environment, string[]> = {
    FOREST: ['Copertura vegetale', 'Umidita', 'Mobilita tra ostacoli', 'Visibilita predatori'],
    MOUNTAIN: ['Pendenza', 'Freddo e vento', 'Ossigeno', 'Stabilita rocciosa'],
    SWAMP: ['Calore', 'Umidita', 'Acqua stagnante', 'Pressione predatori'],
}

const EVENT_ROTATION: Record<Environment, Array<Omit<EnvironmentEventMock, 'isMock'>>> = {
    FOREST: [
        { title: 'Pioggia improvvisa', detail: 'Aumenta il valore dei tratti che migliorano movimento e percezione.', kind: 'resource' },
        { title: 'Predatori in pattuglia', detail: 'Il rischio sale nelle aree aperte e favorisce specie piu reattive.', kind: 'predators' },
    ],
    MOUNTAIN: [
        { title: 'Vento gelido', detail: 'Resistenza e metabolismo diventano decisivi nelle creste esposte.', kind: 'cold' },
        { title: 'Frana locale', detail: 'Le vie dirette si riducono e aumenta la competizione sulle zone sicure.', kind: 'resource' },
    ],
    SWAMP: [
        { title: 'Acqua in risalita', detail: 'Le zone asciutte si restringono e cresce il valore dei tratti anfibi.', kind: 'flood' },
        { title: 'Siccita breve', detail: 'Meno risorse idriche: aumenta la pressione sul metabolismo.', kind: 'drought' },
    ],
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

export function getBiomeLabel(environment: Environment | null): string {
    if (!environment) {
        return 'Bioma sconosciuto'
    }

    return BIOME_LABELS[environment]
}

export function getEnvironmentPressures(environment: Environment | null): EnvironmentPressure[] {
    if (!environment) {
        return []
    }

    const modifiers = ENVIRONMENT_MODIFIERS[environment]
    const values = Object.values(modifiers)
    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    const labels = PRESSURE_LABELS[environment]

    return labels.map((label, index) => {
        const traits = Object.keys(modifiers) as TraitType[]
        const traitA = traits[index % traits.length]
        const traitB = traits[(index + 1) % traits.length]
        const composite = (modifiers[traitA] + modifiers[traitB]) / 2

        return {
            id: `${environment}-${index}`,
            label,
            intensity: levelFromScore(composite),
            score: Math.max(0, Math.min(4, Math.round((composite - average + 2) * 1.2))),
        }
    })
}

export function getFavoredAndPenalizedTraits(environment: Environment | null): { favored: string[]; penalized: string[] } {
    if (!environment) {
        return { favored: [], penalized: [] }
    }

    const entries = (Object.entries(ENVIRONMENT_MODIFIERS[environment]) as Array<[TraitType, number]>).sort((a, b) => b[1] - a[1])

    return {
        favored: entries.slice(0, 2).map(([trait]) => TRAIT_LABELS[trait]),
        penalized: entries.slice(-2).map(([trait]) => TRAIT_LABELS[trait]),
    }
}

export function getEnvironmentEventMock(environment: Environment | null, roundNumber: number): EnvironmentEventMock | null {
    if (!environment) {
        return null
    }

    const events = EVENT_ROTATION[environment]
    const selected = events[(Math.max(0, roundNumber - 1)) % events.length]

    return {
        ...selected,
        isMock: true,
    }
}

export function getTraitTradeoffMock(trait: TraitType | null): TraitTradeoffMock | null {
    if (!trait) {
        return null
    }

    return TRAIT_TRADEOFFS[trait]
}

export function getHabitatZonesMock(diff: number): HabitatZone[] {
    return [
        { id: 'z1', label: 'Sponde', control: diff >= 3 ? 'player' : diff <= -3 ? 'opponent' : 'neutral' },
        { id: 'z2', label: 'Nido alto', control: diff >= 1 ? 'player' : 'neutral' },
        { id: 'z3', label: 'Pozza risorse', control: diff <= -1 ? 'opponent' : 'neutral' },
        { id: 'z4', label: 'Passo stretto', control: 'hazard' },
        { id: 'z5', label: 'Area aperta', control: diff >= 4 ? 'player' : diff <= -4 ? 'opponent' : 'neutral' },
        { id: 'z6', label: 'Margine bosco', control: diff >= 2 ? 'player' : diff <= -2 ? 'opponent' : 'neutral' },
    ]
}

export function calculateAdaptationIndex(environment: Environment | null, traits: TraitCollection | null, score: number): number {
    if (!environment || !traits) {
        return score * 8
    }

    const weighted = (Object.entries(traits) as Array<[TraitType, { level: number }]>).reduce((sum, [trait, state]) => {
        return sum + state.level * (ENVIRONMENT_MODIFIERS[environment][trait] + 1)
    }, 0)

    return score * 8 + weighted
}
