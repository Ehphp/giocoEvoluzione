import { ADAPTATION_IDS, LEGACY_PASSIVE_COMBAT_MUTATION_LOADOUTS, ROUND_EVENT_DEFINITIONS, RULE_VERSION, createInitialAdaptations, createInitialCombatMutationState, getLegalBotActions, resolveRound, type CombatMutationLoadout } from '../shared/game-rules/index.ts'

export function assertAuditEquivalence(): void {
    const loadouts: CombatMutationLoadout[] = LEGACY_PASSIVE_COMBAT_MUTATION_LOADOUTS.map((loadout) => [...loadout] as CombatMutationLoadout)
    for (const loadout of loadouts) for (const event of ROUND_EVENT_DEFINITIONS) for (const action of getLegalBotActions(createInitialAdaptations())) {
        const opponent = { trait: ADAPTATION_IDS.find((gene) => gene !== action.trait)!, actionType: 'EVOLVE' as const }
        const resolution = resolveRound({ roundNumber: 1, roundEvent: event, player1Id: 'audit-left', player2Id: 'audit-right', player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION, player1CombatMutationLoadout: loadout, player2CombatMutationLoadout: loadout, player1CombatMutationState: { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' }, player2CombatMutationState: createInitialCombatMutationState(), player1Action: { playerId: 'audit-left', ...action }, player2Action: { playerId: 'audit-right', ...opponent } })
        const expectedBonus = action.actionType === 'USE' && loadout.includes('ADAPTIVE_CORE') ? 1 : 0
        if (resolution.player1.breakdown.mutationBonus !== expectedBonus) throw new Error('Combat Mutation loadout audit mismatch.')
    }
}
export function generateSequences(): string[][] { const result: string[][] = []; const values = ROUND_EVENT_DEFINITIONS.map((event) => event.id); const visit = (index: number) => { if (index === values.length) { result.push([...values]); return } for (let swap = index; swap < values.length; swap += 1) { [values[index], values[swap]] = [values[swap]!, values[index]!]; visit(index + 1); [values[index], values[swap]] = [values[swap]!, values[index]!] } }; visit(0); return result }
