import { ADAPTATION_CATALOG, MAX_ADAPTATION_LEVEL, MAX_SCHEDULED_ROUNDS, ROUND_EVENT_BY_ID, ROUND_EVENT_DEFINITIONS, SUPPORTED_RULE_VERSIONS, TOTAL_ROUNDS } from './catalog.ts'
import { ADAPTATION_IDS, COMBAT_MUTATION_IDS, type AdaptationCollection, type AdaptationId, type AdaptationState, type CombatMutationId, type CombatMutationLoadout, type CombatMutationState, type EnvironmentalCrisisDefinition, type FineDelMondoActivation, type SymbiosisLink } from './types.ts'
export { ADAPTATION_IDS, TOTAL_ROUNDS, MAX_ADAPTATION_LEVEL }
export function createInitialAdaptations(): AdaptationCollection { return Object.fromEntries(ADAPTATION_IDS.map((adaptation) => [adaptation, { level: 0, exhausted: false }])) as AdaptationCollection }
export function normalizeAdaptationCollection(value: Partial<Record<AdaptationId, { level?: unknown; exhausted?: unknown }>> | null | undefined): AdaptationCollection { const adaptations = createInitialAdaptations(); for (const adaptation of ADAPTATION_IDS) { const state = value?.[adaptation]; if (!state) continue; if (typeof state.level === 'number' && Number.isFinite(state.level)) adaptations[adaptation].level = Math.max(0, Math.min(MAX_ADAPTATION_LEVEL, Math.trunc(state.level))) as AdaptationState['level']; if (typeof state.exhausted === 'boolean') adaptations[adaptation].exhausted = state.exhausted } return adaptations }
export function createInitialCombatMutationState(): CombatMutationState { return { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT', armoredMemoryUsed: false, recoverySurgeUsed: false } }
export function createInitialSymbiosisLinks(): SymbiosisLink[] { return [] }

export class CombatMutationDataError extends Error {
    readonly code: 'INVALID_COMBAT_MUTATION_LOADOUT' | 'INVALID_COMBAT_MUTATION_STATE'
    readonly field: string

    constructor(code: CombatMutationDataError['code'], field: string) {
        super(`${code}: ${field}`)
        this.name = 'CombatMutationDataError'
        this.code = code
        this.field = field
    }
}

export class UnsupportedRuleVersionError extends Error {
    readonly code = 'UNSUPPORTED_RULE_VERSION'
    readonly ruleVersion: string

    constructor(ruleVersion: string) {
        super(`UNSUPPORTED_RULE_VERSION: ${ruleVersion}`)
        this.name = 'UnsupportedRuleVersionError'
        this.ruleVersion = ruleVersion
    }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Exact persisted shape; production readers must fail rather than repair match data. */
export function isCombatMutationState(value: unknown): value is CombatMutationState {
    if (!isPlainRecord(value)) return false
    const keys = Object.keys(value)
    return keys.length === 4
        && keys.every((key) => ['elasticLimbsUsed', 'adaptiveCoreStatus', 'armoredMemoryUsed', 'recoverySurgeUsed'].includes(key))
        && typeof value.elasticLimbsUsed === 'boolean'
        && (value.adaptiveCoreStatus === 'DORMANT' || value.adaptiveCoreStatus === 'ARMED' || value.adaptiveCoreStatus === 'CONSUMED')
        && typeof value.armoredMemoryUsed === 'boolean'
        && typeof value.recoverySurgeUsed === 'boolean'
}

export function parseCombatMutationState(value: unknown, field = 'combat_mutation_state'): CombatMutationState {
    if (!isCombatMutationState(value)) throw new CombatMutationDataError('INVALID_COMBAT_MUTATION_STATE', field)
    return { elasticLimbsUsed: value.elasticLimbsUsed, adaptiveCoreStatus: value.adaptiveCoreStatus, armoredMemoryUsed: value.armoredMemoryUsed, recoverySurgeUsed: value.recoverySurgeUsed }
}

/** Slot 1 and Slot 2 are persisted in this exact order; gameplay treats membership as a set. */
export function isCombatMutationLoadout(value: unknown): value is CombatMutationLoadout {
    return Array.isArray(value)
        && value.length === 2
        && value.every((id) => typeof id === 'string' && COMBAT_MUTATION_IDS.includes(id as CombatMutationId))
        && value[0] !== value[1]
}

export function parseCombatMutationLoadout(value: unknown, field = 'combat_mutation_loadout'): CombatMutationLoadout {
    if (!isCombatMutationLoadout(value)) throw new CombatMutationDataError('INVALID_COMBAT_MUTATION_LOADOUT', field)
    return [value[0], value[1]]
}

function isAdaptationId(value: unknown): value is AdaptationId { return typeof value === 'string' && ADAPTATION_IDS.includes(value as AdaptationId) }
export function isSymbiosisLink(value: unknown): value is SymbiosisLink {
    if (!isPlainRecord(value)) return false
    const keys = Object.keys(value)
    return keys.length === 5
        && keys.every((key) => ['ownerPlayerId', 'sourceTrait', 'targetPlayerId', 'targetTrait', 'activatedRound'].includes(key))
        && typeof value.ownerPlayerId === 'string' && value.ownerPlayerId.length > 0
        && isAdaptationId(value.sourceTrait)
        && typeof value.targetPlayerId === 'string' && value.targetPlayerId.length > 0
        && isAdaptationId(value.targetTrait)
        && typeof value.activatedRound === 'number' && Number.isInteger(value.activatedRound) && value.activatedRound >= 1
}
export function isSymbiosisLinks(value: unknown): value is SymbiosisLink[] {
    return Array.isArray(value)
        && value.length <= 2
        && value.every(isSymbiosisLink)
        && new Set(value.map((link) => link.ownerPlayerId)).size === value.length
}
export function parseSymbiosisLinks(value: unknown, field = 'symbiosis_links'): SymbiosisLink[] {
    if (!isSymbiosisLinks(value)) throw new Error(`INVALID_SYMBIOSIS_LINKS: ${field}`)
    return value.map((link) => ({ ...link }))
}

export function isFineDelMondoActivation(value: unknown): value is FineDelMondoActivation {
    if (!isPlainRecord(value)) return false
    const keys = Object.keys(value)
    return keys.length === 3
        && keys.every((key) => ['ownerPlayerId', 'activatedRound', 'outcome'].includes(key))
        && typeof value.ownerPlayerId === 'string' && value.ownerPlayerId.length > 0
        && typeof value.activatedRound === 'number' && Number.isInteger(value.activatedRound) && value.activatedRound >= 3 && value.activatedRound <= 10
        && (value.outcome === 'FINE_DEL_MONDO' || value.outcome === 'ERA_PROSPERA')
}
export function isFineDelMondoActivations(value: unknown): value is FineDelMondoActivation[] {
    return Array.isArray(value)
        && value.length <= 2
        && value.every(isFineDelMondoActivation)
        && new Set(value.map((activation) => activation.ownerPlayerId)).size === value.length
}
export function parseFineDelMondoActivations(value: unknown, field = 'fine_del_mondo_activations'): FineDelMondoActivation[] {
    if (!isFineDelMondoActivations(value)) throw new Error(`INVALID_FINE_DEL_MONDO_ACTIVATIONS: ${field}`)
    return value.map((activation) => ({ ...activation }))
}

/** Cache-only canonicalization. It never writes, displays or changes a slot order. */
export function canonicalCombatMutationLoadoutCacheKey(loadout: CombatMutationLoadout): string {
    return [...loadout].sort((left, right) => COMBAT_MUTATION_IDS.indexOf(left) - COMBAT_MUTATION_IDS.indexOf(right)).join(',')
}

export function isSupportedRuleVersion(value: unknown): value is (typeof SUPPORTED_RULE_VERSIONS)[number] { return typeof value === 'string' && SUPPORTED_RULE_VERSIONS.includes(value as (typeof SUPPORTED_RULE_VERSIONS)[number]) }
export function assertSupportedRuleVersion(value: unknown): asserts value is (typeof SUPPORTED_RULE_VERSIONS)[number] {
    if (!isSupportedRuleVersion(value)) throw new UnsupportedRuleVersionError(typeof value === 'string' ? value : String(value ?? 'missing'))
}
export function getAdaptationLabel(adaptation: AdaptationId): string { return ADAPTATION_CATALOG[adaptation].label }
export function getRoundEventById(eventId: string): EnvironmentalCrisisDefinition { const roundEvent = ROUND_EVENT_BY_ID[eventId]; if (!roundEvent) throw new Error(`Unknown environmental crisis "${eventId}".`); return roundEvent }
export function getRoundEventForRound(sequence: string[], roundNumber: number): EnvironmentalCrisisDefinition | null { const eventId = sequence[roundNumber - 1]; return eventId ? getRoundEventById(eventId) : null }
/** Persist enough events for the largest legal schedule; match state chooses the live prefix. */
export function generateRoundEventSequence(random: () => number = Math.random): string[] { const ids = ROUND_EVENT_DEFINITIONS.map((roundEvent) => roundEvent.id); for (let index = ids.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [ids[index], ids[swap]] = [ids[swap]!, ids[index]!] } return Array.from({ length: MAX_SCHEDULED_ROUNDS }, (_, index) => ids[index % ids.length]!) }
