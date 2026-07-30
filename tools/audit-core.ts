import { ADAPTATION_IDS, ROUND_EVENT_DEFINITIONS, createInitialAdaptations, getLegalBotActions, resolveRound } from '../shared/game-rules/index.ts'

export function assertAuditEquivalence(): void {
    for (const event of ROUND_EVENT_DEFINITIONS) for (const action of getLegalBotActions(createInitialAdaptations())) {
        const opponent = { trait: ADAPTATION_IDS.find((gene) => gene !== action.trait)!, actionType: 'EVOLVE' as const }
        resolveRound({ roundNumber: 1, roundEvent: event, player1Id: 'audit-left', player2Id: 'audit-right', player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), player1Action: { playerId: 'audit-left', ...action }, player2Action: { playerId: 'audit-right', ...opponent } })
    }
}
export function generateSequences(): string[][] { const result: string[][] = []; const values = ROUND_EVENT_DEFINITIONS.map((event) => event.id); const visit = (index: number) => { if (index === values.length) { result.push([...values]); return } for (let swap = index; swap < values.length; swap += 1) { [values[index], values[swap]] = [values[swap]!, values[index]!]; visit(index + 1); [values[index], values[swap]] = [values[swap]!, values[index]!] } }; visit(0); return result }
