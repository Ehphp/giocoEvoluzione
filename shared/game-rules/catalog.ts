import { BOT_COMBAT_MUTATION_LOADOUT, COMBAT_MUTATION_CATALOG, LEGACY_PASSIVE_COMBAT_MUTATION_IDS, LEGACY_PASSIVE_COMBAT_MUTATION_LOADOUTS } from './combat-mutations.ts'
import type { AdaptationDefinition, AdaptationId, EnvironmentalCrisisDefinition } from './types.ts'

export { BOT_COMBAT_MUTATION_LOADOUT, COMBAT_MUTATION_CATALOG, LEGACY_PASSIVE_COMBAT_MUTATION_IDS, LEGACY_PASSIVE_COMBAT_MUTATION_LOADOUTS }

/** Rules frozen on existing matches before SYMBIOSIS was introduced. */
export const LEGACY_RULE_VERSION = 'combat-mutations-loadout-mvp-v1'
/** Rules frozen on matches created with SYMBIOSIS but before dynamic duration. */
export const SYMBIOSIS_RULE_VERSION = 'combat-mutations-symbiosis-v1'
/** Rules selected by every newly-created match. */
export const RULE_VERSION = 'combat-mutations-fine-del-mondo-v1'
export const SUPPORTED_RULE_VERSIONS = [LEGACY_RULE_VERSION, SYMBIOSIS_RULE_VERSION, RULE_VERSION] as const
export const STANDARD_SCHEDULED_ROUNDS = 7
export const MIN_SCHEDULED_ROUNDS = 5
export const MAX_SCHEDULED_ROUNDS = 10
/** @deprecated Use STANDARD_SCHEDULED_ROUNDS for the default, never as a match limit. */
export const TOTAL_ROUNDS = STANDARD_SCHEDULED_ROUNDS
/** @deprecated Runtime clinch is derived from scheduled rounds and current score. */
export const WINS_TO_WIN = 4
export const BASE_USE_VALUE = 2
/** Fixed round value of EVOLVE; event and matchup modifiers never apply. */
export const EVOLVE_ROUND_VALUE = 1
export const MAX_ADAPTATION_LEVEL = 2
export const LEVEL_BONUS = [0, 1, 2] as const
export const NATURAL_ADVANTAGE_BONUS = 2
export const ROUND_WIN_POINTS = 1

export const ADAPTATION_CATALOG: Record<AdaptationId, AdaptationDefinition> = {
    FEROCITY: { id: 'FEROCITY', label: 'Ferocia', description: 'Impulso offensivo e pressione sul rivale.', assetKey: 'ferocity', displayOrder: 1 },
    ARMOR: { id: 'ARMOR', label: 'Corazza', description: 'Difesa fisica e resistenza agli urti.', assetKey: 'armor', displayOrder: 2 },
    AGILITY: { id: 'AGILITY', label: 'Agilita', description: 'Movimento rapido e manovre evasive.', assetKey: 'agility', displayOrder: 3 },
    SENSES: { id: 'SENSES', label: 'Sensi', description: 'Lettura dell ambiente e anticipazione delle minacce.', assetKey: 'senses', displayOrder: 4 },
    CAMOUFLAGE: { id: 'CAMOUFLAGE', label: 'Mimetismo', description: 'Occultamento e confusione visiva.', assetKey: 'camouflage', displayOrder: 5 },
}

export const NATURAL_ADVANTAGE: Record<AdaptationId, AdaptationId> = {
    FEROCITY: 'ARMOR', ARMOR: 'AGILITY', AGILITY: 'SENSES', SENSES: 'CAMOUFLAGE', CAMOUFLAGE: 'FEROCITY',
}

function crisis(id: string, title: string, shortDescription: string, category: EnvironmentalCrisisDefinition['category'], modifiers: EnvironmentalCrisisDefinition['modifiers'], reasons: Partial<Record<AdaptationId, string>>): EnvironmentalCrisisDefinition {
    return { id, title, shortDescription, category, artKey: `event-${id.toLowerCase().replaceAll('_', '-')}`, tags: [], modifiers,
        effects: Object.entries(modifiers).map(([adaptation, modifier]) => ({ trait: adaptation as AdaptationId, modifier, reason: reasons[adaptation as AdaptationId] ?? 'Affinita biologica con questa crisi ambientale.' })) }
}

export const ROUND_EVENT_DEFINITIONS: EnvironmentalCrisisDefinition[] = [
    crisis('VOLCANIC_ASH_WAVE', 'Ondata di ceneri vulcaniche', 'Particelle abrasive e visibilita ridotta.', 'GEOLOGICAL', { FEROCITY: 2, ARMOR: 2, AGILITY: 0, SENSES: 1, CAMOUFLAGE: 1 }, { FEROCITY: 'La ferocia apre un varco nei detriti.', ARMOR: 'La corazza resiste al particolato abrasivo.', AGILITY: 'La cenere rende le manovre meno adatte.' }),
    crisis('PROLONGED_ECLIPSE', 'Eclissi prolungata', 'Luce minima e orientamento instabile.', 'ASTRONOMICAL', { FEROCITY: 2, ARMOR: 1, AGILITY: 2, SENSES: 0, CAMOUFLAGE: 0 }, { AGILITY: 'L agilita compensa la luce minima.', SENSES: 'La luce instabile rende i segnali meno affidabili.', CAMOUFLAGE: 'Il mimetismo ha meno riferimenti al buio.' }),
    crisis('PREDATOR_PACK_MIGRATION', 'Migrazione di predatori', 'La catena trofica entra in pressione.', 'BIOLOGICAL', { FEROCITY: 1, ARMOR: 0, AGILITY: 2, SENSES: 2, CAMOUFLAGE: 0 }, { FEROCITY: 'La ferocia risponde alla pressione.', AGILITY: 'L agilita evita il branco.', SENSES: 'I sensi anticipano l avvicinamento.' }),
    crisis('HEAT_SPIKE', 'Picco termico persistente', 'Calore costante e consumo energetico alto.', 'CLIMATE', { FEROCITY: 0, ARMOR: 1, AGILITY: 1, SENSES: 2, CAMOUFLAGE: 2 }, { FEROCITY: 'La ferocia e meno adatta al consumo energetico del caldo.', SENSES: 'I sensi aiutano a trovare riparo.', CAMOUFLAGE: 'Il mimetismo favorisce la termoregolazione.' }),
    crisis('NUTRIENT_COLLAPSE', 'Collasso risorse nutritive', 'Scarsita estesa nelle zone di foraggiamento.', 'ECOLOGICAL', { FEROCITY: 1, ARMOR: 2, AGILITY: 0, SENSES: 0, CAMOUFLAGE: 1 }, { ARMOR: 'La corazza protegge nella competizione.', CAMOUFLAGE: 'Il mimetismo facilita l accesso alle risorse.' }),
    crisis('FLASH_FLOOD', 'Inondazione lampo', 'Canali rapidi e terreno allagato.', 'ECOLOGICAL', { FEROCITY: 0, ARMOR: 0, AGILITY: 1, SENSES: 1, CAMOUFLAGE: 2 }, { SENSES: 'I sensi leggono la corrente.', CAMOUFLAGE: 'Il mimetismo sfrutta il fondale.' }),
]
export const ROUND_EVENT_BY_ID = Object.fromEntries(ROUND_EVENT_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<string, EnvironmentalCrisisDefinition>
export const PRODUCTION_CATALOG_AUDIT = { ruleVersion: RULE_VERSION, fitnessVersion: RULE_VERSION, candidateId: 'natural-advantage-cycle-v1', catalogSignature: RULE_VERSION, auditSeed: 1592598566, validatedSequences: 720 } as const
