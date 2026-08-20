import { ADAPTATION_IDS, ROUND_EVENT_DEFINITIONS, createInitialAdaptations, createInitialCombatMutationState, getLegalBotActions, resolveRound } from '../shared/game-rules/index.ts'

export function assertAuditEquivalence(): void {
    for (const event of ROUND_EVENT_DEFINITIONS) for (const action of getLegalBotActions(createInitialAdaptations())) {
        const opponent = { trait: ADAPTATION_IDS.find((gene) => gene !== action.trait)!, actionType: 'EVOLVE' as const }
        const resolution = resolveRound({ roundNumber: 1, roundEvent: event, player1Id: 'audit-left', player2Id: 'audit-right', player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), player1CombatMutationState: { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' }, player2CombatMutationState: createInitialCombatMutationState(), player1Action: { playerId: 'audit-left', ...action }, player2Action: { playerId: 'audit-right', ...opponent } })
        if (action.actionType === 'USE' && resolution.player1.breakdown.mutationBonus !== 1) throw new Error('Adaptive Core audit mismatch.')
        if (action.actionType === 'EVOLVE' && resolution.player1.combatMutationState.adaptiveCoreStatus !== 'ARMED') throw new Error('Adaptive Core should stay armed after later EVOLVE.')
    }
}
export function generateSequences(): string[][] { const result: string[][] = []; const values = ROUND_EVENT_DEFINITIONS.map((event) => event.id); const visit = (index: number) => { if (index === values.length) { result.push([...values]); return } for (let swap = index; swap < values.length; swap += 1) { [values[index], values[swap]] = [values[swap]!, values[index]!]; visit(index + 1); [values[index], values[swap]] = [values[swap]!, values[index]!] } }; visit(0); return result }
