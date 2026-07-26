import { BASE_USE_VALUE, GENE_IDS, MAX_TRAIT_LEVEL, createInitialGenes, getLegalBotActions, getRoundEventById, resolveRound, type GeneId } from '../shared/game-rules/index.ts'

export const GENE_COUNT = GENE_IDS.length
const COOLDOWN_NONE = GENE_COUNT
const LEVEL_RADIX = MAX_TRAIT_LEVEL + 1
const POWERS = Array.from({ length: GENE_COUNT }, (_, index) => LEVEL_RADIX ** index)
export type AuditAction = { trait: number; actionType: 'USE' | 'EVOLVE' }

export function encodeState(levelCode = 0, cooldown = COOLDOWN_NONE): number { return levelCode * (GENE_COUNT + 1) + cooldown }
export function decodeState(state: number) { return { levelCode: Math.floor(state / (GENE_COUNT + 1)), cooldown: state % (GENE_COUNT + 1) } }
export function getLevel(levelCode: number, trait: number): number { return Math.floor(levelCode / POWERS[trait]!) % LEVEL_RADIX }
export function toGenes(state: number) {
    const { levelCode, cooldown } = decodeState(state)
    const genes = createInitialGenes()
    GENE_IDS.forEach((gene, trait) => { genes[gene].level = getLevel(levelCode, trait); genes[gene].cooldown = cooldown === trait ? 1 : 0 })
    return genes
}
export function legalActions(state: number): AuditAction[] {
    const { levelCode, cooldown } = decodeState(state)
    return GENE_IDS.flatMap((_, trait) => [
        ...(trait !== cooldown ? [{ trait, actionType: 'USE' as const }] : []),
        ...(getLevel(levelCode, trait) < MAX_TRAIT_LEVEL ? [{ trait, actionType: 'EVOLVE' as const }] : []),
    ])
}
export function transition(state: number, action: AuditAction): number {
    const { levelCode } = decodeState(state)
    if (action.actionType === 'EVOLVE') return encodeState(levelCode + POWERS[action.trait]!, COOLDOWN_NONE)
    return encodeState(levelCode, action.trait)
}
export function actionValue(eventId: string, state: number, action: AuditAction): number {
    if (action.actionType === 'EVOLVE') return 0
    const roundEvent = getRoundEventById(eventId)
    return BASE_USE_VALUE + getLevel(decodeState(state).levelCode, action.trait) + roundEvent.modifiers[GENE_IDS[action.trait]!]
}
export function actionKey(action: AuditAction): string { return `${action.actionType}:${GENE_IDS[action.trait]}` }
export function generateSequences(): string[][] {
    const ids = ['VOLCANIC_ASH_WAVE', 'PROLONGED_ECLIPSE', 'PREDATOR_PACK_MIGRATION', 'HEAT_SPIKE', 'NUTRIENT_COLLAPSE', 'FLASH_FLOOD']
    const output: string[][] = []
    const visit = (prefix: string[], remaining: string[]) => {
        if (!remaining.length) { output.push(prefix); return }
        remaining.forEach((eventId, index) => visit([...prefix, eventId], [...remaining.slice(0, index), ...remaining.slice(index + 1)]))
    }
    visit([], ids)
    return output
}
export function assertAuditEquivalence(): void {
    const samples: AuditAction[] = [{ trait: 0, actionType: 'USE' }, { trait: 3, actionType: 'EVOLVE' }]
    for (const action of samples) {
        const state = encodeState(POWERS[3]!, COOLDOWN_NONE)
        const genes = toGenes(state)
        const event = getRoundEventById('HEAT_SPIKE')
        const real = resolveRound({ roundNumber: 1, roundEvent: event, player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: GENE_IDS[action.trait]!, actionType: action.actionType }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'EVOLVE' } })
        if (real.player1.roundValue !== actionValue(event.id, state, action)) throw new Error(`Audit payoff mismatch for ${actionKey(action)}`)
        const expected = real.player1.traits
        const actual = toGenes(transition(state, action))
        for (const gene of GENE_IDS) if (expected[gene].level !== actual[gene].level || expected[gene].cooldown !== actual[gene].cooldown) throw new Error(`Audit transition mismatch for ${actionKey(action)}`)
    }
    const legal = getLegalBotActions(createInitialGenes()).map((action) => `${action.actionType}:${action.trait}`).sort()
    const packed = legalActions(encodeState()).map((action) => actionKey(action)).sort()
    if (JSON.stringify(legal) !== JSON.stringify(packed)) throw new Error('Audit legal action mismatch.')
}

export function geneId(action: AuditAction): GeneId { return GENE_IDS[action.trait]! }
