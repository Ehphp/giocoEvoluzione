import { BASE_USE_VALUE, GENE_IDS, MAX_TRAIT_LEVEL, createInitialGenes, getLegalBotActions, getRoundEventById, resolveRound, type GeneId } from '../shared/game-rules/index.ts'

export const GENE_COUNT = GENE_IDS.length
export const ACTION_COUNT = GENE_COUNT * 2
export const COOLDOWN_NONE = GENE_COUNT
export const LEVEL_BITS = GENE_COUNT * 2
export const STATE_CAPACITY = 1 << (LEVEL_BITS + 3)
export const VALID_STATE_COUNT = (1 << LEVEL_BITS) * (GENE_COUNT + 1)
export type AuditAction = number
export const USE = (gene: number) => gene << 1
export const EVOLVE = (gene: number) => (gene << 1) | 1
export const actionGene = (action: AuditAction) => action >> 1
export const isEvolve = (action: AuditAction) => (action & 1) === 1

export function encodeState(levelBits = 0, cooldown: number = COOLDOWN_NONE): number { return levelBits | (cooldown << LEVEL_BITS) }
export function levelBitsOf(state: number): number { return state & ((1 << LEVEL_BITS) - 1) }
export function cooldownOf(state: number): number { return state >> LEVEL_BITS }
export function getLevel(state: number, gene: number): number { return (state >> (gene * 2)) & 3 }
export function actionKey(action: AuditAction): string { return `${isEvolve(action) ? 'EVOLVE' : 'USE'}:${GENE_IDS[actionGene(action)]}` }
export function geneId(action: AuditAction): GeneId { return GENE_IDS[actionGene(action)]! }

export const levelByStateGene = new Uint8Array(STATE_CAPACITY * GENE_COUNT)
export const legalActionCount = new Uint8Array(STATE_CAPACITY)
export const legalActionByStateSlot = new Int8Array(STATE_CAPACITY * ACTION_COUNT).fill(-1)
export const nextStateByStateAction = new Int16Array(STATE_CAPACITY * ACTION_COUNT).fill(-1)
export const useValueByEventGeneLevel = new Int8Array(6 * GENE_COUNT * 4)
export const eventIds = ['VOLCANIC_ASH_WAVE', 'PROLONGED_ECLIPSE', 'PREDATOR_PACK_MIGRATION', 'HEAT_SPIKE', 'NUTRIENT_COLLAPSE', 'FLASH_FLOOD'] as const
export const eventIndexById = Object.fromEntries(eventIds.map((id, index) => [id, index])) as Record<string, number>

for (let eventIndex = 0; eventIndex < eventIds.length; eventIndex += 1) {
    const event = getRoundEventById(eventIds[eventIndex]!)
    for (let gene = 0; gene < GENE_COUNT; gene += 1) for (let level = 0; level <= MAX_TRAIT_LEVEL; level += 1) {
        useValueByEventGeneLevel[(eventIndex * GENE_COUNT + gene) * 4 + level] = BASE_USE_VALUE + level + event.modifiers[GENE_IDS[gene]!]
    }
}
for (let bits = 0; bits < (1 << LEVEL_BITS); bits += 1) for (let cooldown = 0; cooldown <= COOLDOWN_NONE; cooldown += 1) {
    const state = encodeState(bits, cooldown)
    let count = 0
    for (let gene = 0; gene < GENE_COUNT; gene += 1) {
        const level = (bits >> (gene * 2)) & 3
        levelByStateGene[state * GENE_COUNT + gene] = level
        if (gene !== cooldown) {
            const action = USE(gene)
            legalActionByStateSlot[state * ACTION_COUNT + count++] = action
            nextStateByStateAction[state * ACTION_COUNT + action] = encodeState(bits, gene)
        }
        if (level < MAX_TRAIT_LEVEL) {
            const action = EVOLVE(gene)
            legalActionByStateSlot[state * ACTION_COUNT + count++] = action
            nextStateByStateAction[state * ACTION_COUNT + action] = encodeState(bits + (1 << (gene * 2)), COOLDOWN_NONE)
        }
    }
    legalActionCount[state] = count
}

export function actionValue(eventIndex: number, state: number, action: AuditAction): number {
    return isEvolve(action) ? 0 : useValueByEventGeneLevel[(eventIndex * GENE_COUNT + actionGene(action)) * 4 + levelByStateGene[state * GENE_COUNT + actionGene(action)]!]!
}
export function buildUseValueTable(modifiers: readonly (readonly number[])[]): Int8Array {
    if (modifiers.length !== eventIds.length || modifiers.some((row) => row.length !== GENE_COUNT)) throw new Error('Invalid candidate modifier matrix.')
    const values = new Int8Array(useValueByEventGeneLevel.length)
    for (let event = 0; event < eventIds.length; event += 1) for (let gene = 0; gene < GENE_COUNT; gene += 1) for (let level = 0; level <= MAX_TRAIT_LEVEL; level += 1) {
        values[(event * GENE_COUNT + gene) * 4 + level] = BASE_USE_VALUE + level + modifiers[event]![gene]!
    }
    return values
}
export function actionValueFromTable(values: Int8Array, eventIndex: number, state: number, action: AuditAction): number {
    return isEvolve(action) ? 0 : values[(eventIndex * GENE_COUNT + actionGene(action)) * 4 + levelByStateGene[state * GENE_COUNT + actionGene(action)]!]!
}
export function nextState(state: number, action: AuditAction): number { return nextStateByStateAction[state * ACTION_COUNT + action]! }
export function getLegalActions(state: number): Int8Array { return legalActionByStateSlot.subarray(state * ACTION_COUNT, state * ACTION_COUNT + legalActionCount[state]!) }
export function generateSequences(): number[][] {
    const result: number[][] = []
    const permutation = [0, 1, 2, 3, 4, 5]
    const visit = (index: number) => {
        if (index === permutation.length) { result.push([...permutation]); return }
        for (let swap = index; swap < permutation.length; swap += 1) {
            ;[permutation[index], permutation[swap]] = [permutation[swap]!, permutation[index]!]
            visit(index + 1)
            ;[permutation[index], permutation[swap]] = [permutation[swap]!, permutation[index]!]
        }
    }
    visit(0)
    return result
}
export function toGenes(state: number) {
    const genes = createInitialGenes()
    for (let gene = 0; gene < GENE_COUNT; gene += 1) { genes[GENE_IDS[gene]!].level = getLevel(state, gene); genes[GENE_IDS[gene]!].cooldown = cooldownOf(state) === gene ? 1 : 0 }
    return genes
}
export function assertAuditEquivalence(exhaustive = false): void {
    const states: number[] = exhaustive ? Array.from({ length: 1 << LEVEL_BITS }, (_, bits) => encodeState(bits, COOLDOWN_NONE)) : [encodeState(1 << 6, COOLDOWN_NONE), encodeState(0, 2)]
    for (const state of states) for (let eventIndex = 0; eventIndex < eventIds.length; eventIndex += 1) for (const action of getLegalActions(state)) {
        const genes = toGenes(state)
        const event = getRoundEventById(eventIds[eventIndex]!)
        const real = resolveRound({ roundNumber: 1, roundEvent: event, player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: geneId(action), actionType: isEvolve(action) ? 'EVOLVE' : 'USE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'EVOLVE' } })
        if (real.player1.roundValue !== actionValue(eventIndex, state, action)) throw new Error(`Audit payoff mismatch for ${actionKey(action)}`)
        const actual = toGenes(nextState(state, action))
        for (const gene of GENE_IDS) if (real.player1.traits[gene].level !== actual[gene].level || real.player1.traits[gene].cooldown !== actual[gene].cooldown) throw new Error(`Audit transition mismatch for ${actionKey(action)}`)
    }
    const legal = getLegalBotActions(createInitialGenes()).map((action) => `${action.actionType}:${action.trait}`).sort()
    const packed = [...getLegalActions(encodeState())].map(actionKey).sort()
    if (JSON.stringify(legal) !== JSON.stringify(packed)) throw new Error('Audit legal action mismatch.')
}
