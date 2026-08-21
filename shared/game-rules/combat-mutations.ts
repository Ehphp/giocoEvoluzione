/**
 * Static Combat Mutations v1 catalog. This intentionally remains code-owned:
 * persistence stores only selected ids and per-match runtime state, never rule
 * definitions. Keeping this as one literal also prevents UI and bot copies
 * from drifting from the game engine vocabulary.
 */
export const COMBAT_MUTATION_CATALOG = {
    ELASTIC_LIMBS: {
        id: 'ELASTIC_LIMBS',
        label: 'Arti elastici',
        description: 'Il primo USA Agilita del match non esaurisce il gene.',
        shortDescription: 'Primo USA Agilita senza esaurimento.',
        displayOrder: 1,
        iconKey: 'elastic-limbs',
    },
    ADAPTIVE_CORE: {
        id: 'ADAPTIVE_CORE',
        label: 'Nucleo adattivo',
        description: 'Il primo EVOLVI arma +1 al successivo USA.',
        shortDescription: 'Dopo il primo EVOLVI, +1 al prossimo USA.',
        displayOrder: 2,
        iconKey: 'adaptive-core',
    },
    ARMORED_MEMORY: {
        id: 'ARMORED_MEMORY',
        label: 'Memoria corazzata',
        description: 'Il primo USA Corazza del match non esaurisce il gene.',
        shortDescription: 'Primo USA Corazza senza esaurimento.',
        displayOrder: 3,
        iconKey: 'armored-memory',
    },
    RECOVERY_SURGE: {
        id: 'RECOVERY_SURGE',
        label: 'Impulso di recupero',
        description: 'Il primo EVOLVI su un gene esausto ottiene +1.',
        shortDescription: 'Primo EVOLVI su gene esausto: +1.',
        displayOrder: 4,
        iconKey: 'recovery-surge',
    },
    SYMBIOSIS: {
        id: 'SYMBIOSIS',
        label: 'Simbiosi',
        description: 'Una volta per partita collega un tuo gene a uno avversario. I loro EVOLVI diretti condividono il livello.',
        shortDescription: 'Collega due geni fino alla fine della partita.',
        displayOrder: 5,
        iconKey: 'symbiosis',
    },
} as const

export type CombatMutationId = keyof typeof COMBAT_MUTATION_CATALOG
export type CombatMutationDefinition = {
    id: CombatMutationId
    label: string
    description: string
    shortDescription: string
    displayOrder: number
    iconKey: string
}

export const COMBAT_MUTATION_IDS = Object.keys(COMBAT_MUTATION_CATALOG) as CombatMutationId[]
/** Fixed matrix used by historic passive-mutation acceptance and metagame audits. */
export const LEGACY_PASSIVE_COMBAT_MUTATION_IDS = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE'] as const satisfies readonly CombatMutationId[]
export const LEGACY_PASSIVE_COMBAT_MUTATION_LOADOUTS = [
    ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'],
    ['ELASTIC_LIMBS', 'ARMORED_MEMORY'],
    ['ELASTIC_LIMBS', 'RECOVERY_SURGE'],
    ['ADAPTIVE_CORE', 'ARMORED_MEMORY'],
    ['ADAPTIVE_CORE', 'RECOVERY_SURGE'],
    ['ARMORED_MEMORY', 'RECOVERY_SURGE'],
] as const satisfies readonly (readonly [CombatMutationId, CombatMutationId])[]

export const BOT_COMBAT_MUTATION_LOADOUT = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const
