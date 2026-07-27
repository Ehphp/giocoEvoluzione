import type { GeneDefinition, GeneId, RoundEventDefinition } from './types.ts'

export const RULE_VERSION = 'five-genes-v2'
export const TOTAL_ROUNDS = 6
export const BASE_USE_VALUE = 1
export const MAX_TRAIT_LEVEL = 2
export const LEVEL_BONUS = [0, 1, 3] as const
export const COOLDOWN_ROUNDS = 1
export const ROUND_WIN_POINTS = 1

export const GENE_CATALOG: Record<GeneId, GeneDefinition> = {
    RESILIENCE: { id: 'RESILIENCE', label: 'Pelle coriacea', description: 'Protezione fisica e stabilita sotto stress.', assetKey: 'resilience', displayOrder: 1 },
    MOBILITY: { id: 'MOBILITY', label: 'Arti elastici', description: 'Fuga, inseguimento e manovra rapida.', assetKey: 'mobility', displayOrder: 2 },
    SENSES: { id: 'SENSES', label: 'Sensi acuti', description: 'Lettura dell ambiente e anticipazione delle minacce.', assetKey: 'senses', displayOrder: 3 },
    METABOLISM: { id: 'METABOLISM', label: 'Metabolismo efficiente', description: 'Gestione di energia, calore e nutrienti.', assetKey: 'metabolism', displayOrder: 4 },
    AQUATIC: { id: 'AQUATIC', label: 'Arti palmati', description: 'Propulsione e termoregolazione in acqua.', assetKey: 'aquatic', displayOrder: 5 },
}

function event(
    id: string,
    title: string,
    shortDescription: string,
    category: RoundEventDefinition['category'],
    modifiers: RoundEventDefinition['modifiers'],
    reasons: Partial<Record<GeneId, string>>,
): RoundEventDefinition {
    return {
        id, title, shortDescription, category, artKey: `event-${id.toLowerCase().replaceAll('_', '-')}`, tags: [], modifiers,
        effects: Object.entries(modifiers)
            .filter(([, modifier]) => modifier !== 0)
            .map(([gene, modifier]) => ({ trait: gene as GeneId, modifier, reason: reasons[gene as GeneId] ?? 'Affinita biologica dell evento.' })),
    }
}

export const ROUND_EVENT_DEFINITIONS: RoundEventDefinition[] = [
    event('VOLCANIC_ASH_WAVE', 'Ondata di ceneri vulcaniche', 'Particelle abrasive e visibilita ridotta.', 'GEOLOGICAL',
        { RESILIENCE: 3, MOBILITY: 3, SENSES: -1, METABOLISM: 0, AQUATIC: 0 },
        { RESILIENCE: 'La pelle coriacea resiste al particolato abrasivo.', MOBILITY: 'Arti elastici superano rapidamente i detriti e le nubi basse.', SENSES: 'La cenere riduce la lettura del territorio.' }),
    event('PROLONGED_ECLIPSE', 'Eclissi prolungata', 'Luce minima e orientamento instabile.', 'ASTRONOMICAL',
        { RESILIENCE: 2, MOBILITY: 1, SENSES: 3, METABOLISM: -1, AQUATIC: -1 },
        { RESILIENCE: 'La pelle coriacea protegge durante gli spostamenti incerti.', MOBILITY: 'Arti elastici aiutano negli spostamenti cauti.', SENSES: 'I sensi acuti compensano la luce minima.', METABOLISM: 'I ritmi energetici perdono riferimenti ambientali.', AQUATIC: 'La specializzazione acquatica non offre appigli al buio.' }),
    event('PREDATOR_PACK_MIGRATION', 'Migrazione di predatori', 'La catena trofica entra in pressione.', 'BIOLOGICAL',
        { RESILIENCE: 1, MOBILITY: -1, SENSES: 2, METABOLISM: 2, AQUATIC: -1 },
        { RESILIENCE: 'La pelle coriacea aiuta a reggere gli urti durante la fuga.', MOBILITY: 'Le rotte affollate rendono rischiose le manovre elastiche.', SENSES: 'I sensi anticipano l avvicinamento del branco.', METABOLISM: 'La gestione delle riserve sostiene una fuga prolungata.', AQUATIC: 'Gli arti palmati rendono meno sul terreno sotto pressione.' }),
    event('HEAT_SPIKE', 'Picco termico persistente', 'Calore costante e consumo energetico alto.', 'CLIMATE',
        { RESILIENCE: -1, MOBILITY: 0, SENSES: 1, METABOLISM: 3, AQUATIC: 2 },
        { RESILIENCE: 'La protezione isolante peggiora la dissipazione.', SENSES: 'I sensi acuti aiutano a trovare riparo e segnali di calore.', METABOLISM: 'La regolazione energetica sostiene lo stress termico.', AQUATIC: 'Gli arti palmati favoriscono la termoregolazione vicino all acqua.' }),
    event('NUTRIENT_COLLAPSE', 'Collasso risorse nutritive', 'Scarsita estesa nelle zone di foraggiamento.', 'ECOLOGICAL',
        { RESILIENCE: 0, MOBILITY: 2, SENSES: -1, METABOLISM: -1, AQUATIC: 1 },
        { MOBILITY: 'La mobilita amplia l area di ricerca delle risorse residue.', SENSES: 'Le poche tracce disponibili rendono piu difficile leggere il territorio.', METABOLISM: 'L efficienza da sola non basta quando le risorse collassano.', AQUATIC: 'I corsi d acqua residui offrono vie di approvvigionamento.' }),
    event('FLASH_FLOOD', 'Inondazione lampo', 'Canali rapidi e terreno allagato.', 'ECOLOGICAL',
        { RESILIENCE: -1, MOBILITY: -1, SENSES: 0, METABOLISM: 1, AQUATIC: 3 },
        { RESILIENCE: 'La struttura rigida cede piu facilmente alla corrente improvvisa.', MOBILITY: 'La corsa perde efficacia nell acqua impetuosa.', METABOLISM: 'Una riserva ben gestita sostiene la reazione immediata.', AQUATIC: 'Gli arti palmati migliorano drasticamente la propulsione.' }),
]

export const ROUND_EVENT_BY_ID = Object.fromEntries(ROUND_EVENT_DEFINITIONS.map((eventDefinition) => [eventDefinition.id, eventDefinition])) as Record<string, RoundEventDefinition>

// Static provenance only: runtime rules remain the typed event catalog above.
export const PRODUCTION_CATALOG_AUDIT = {
    ruleVersion: RULE_VERSION,
    fitnessVersion: 'five-genes-fitness-v2',
    candidateId: 'balanced-level-v2',
    catalogSignature: '28340e8792d8a0b6',
    auditSeed: 1592598566,
    validatedSequences: 720,
} as const
