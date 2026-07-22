import type { TraitType } from './types'

export type TraitCatalogEntry = {
    id: TraitType
    label: string
    description: string
    iconKey: TraitType
    displayOrder: number
}

export const TRAIT_CATALOG: Record<TraitType, TraitCatalogEntry> = {
    STRENGTH: {
        id: 'STRENGTH',
        label: 'Muscolatura compatta',
        description: 'Struttura potente utile per ostacoli e pendenze, poco adatta ai terreni profondi.',
        iconKey: 'STRENGTH',
        displayOrder: 1,
    },
    RESISTANCE: {
        id: 'RESISTANCE',
        label: 'Pelle isolante',
        description: 'Protezione dal freddo, dal vento e dalle superfici abrasive.',
        iconKey: 'RESISTANCE',
        displayOrder: 2,
    },
    AGILITY: {
        id: 'AGILITY',
        label: 'Arti elastici',
        description: 'Movimento rapido tra radici, rami e passaggi stretti.',
        iconKey: 'AGILITY',
        displayOrder: 3,
    },
    PERCEPTION: {
        id: 'PERCEPTION',
        label: 'Sensi acuti',
        description: 'Orientamento in vegetazione, nebbia e scarsa visibilita.',
        iconKey: 'PERCEPTION',
        displayOrder: 4,
    },
    METABOLISM: {
        id: 'METABOLISM',
        label: 'Respirazione efficiente',
        description: 'Tolleranza ad aria stagnante, umidita e poco ossigeno.',
        iconKey: 'METABOLISM',
        displayOrder: 5,
    },
    ADAPTATION: {
        id: 'ADAPTATION',
        label: 'Plasticita biologica',
        description: 'Adattamento moderato e flessibile a condizioni differenti.',
        iconKey: 'ADAPTATION',
        displayOrder: 6,
    },
    GRIP_CLAWS: {
        id: 'GRIP_CLAWS',
        label: 'Artigli prensili',
        description: 'Presa stabile su rocce, pareti e tronchi.',
        iconKey: 'GRIP_CLAWS',
        displayOrder: 7,
    },
    CAMOUFLAGE: {
        id: 'CAMOUFLAGE',
        label: 'Mimetismo naturale',
        description: 'Occultamento attraverso colore e texture della pelle.',
        iconKey: 'CAMOUFLAGE',
        displayOrder: 8,
    },
    WEBBED_LIMBS: {
        id: 'WEBBED_LIMBS',
        label: 'Arti palmati',
        description: 'Maggiore mobilita in acqua e fango.',
        iconKey: 'WEBBED_LIMBS',
        displayOrder: 9,
    },
    FAT_RESERVES: {
        id: 'FAT_RESERVES',
        label: 'Riserva adiposa',
        description: 'Protezione dal freddo e riserva energetica.',
        iconKey: 'FAT_RESERVES',
        displayOrder: 10,
    },
}
