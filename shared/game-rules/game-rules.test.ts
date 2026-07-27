import { describe, expect, it } from 'vitest'
import { GENE_IDS, PRODUCTION_CATALOG_AUDIT, ROUND_EVENT_DEFINITIONS, RULE_VERSION, buildPersistedRoundResolution, createInitialGenes, getRoundEventById, getValidatedGeneUseBreakdown, resolveRound, validateCatalog } from './index.ts'

describe('five-gene rules', () => {
    it('validates the approved event matrix with explicit zero signs', () => {
        expect(validateCatalog()).toEqual([])
        expect(ROUND_EVENT_DEFINITIONS).toHaveLength(6)
    })

    it('locks the production candidate matrix and its audit signature', () => {
        const matrix = ROUND_EVENT_DEFINITIONS.map((event) => GENE_IDS.map((gene) => event.modifiers[gene]))
        expect(matrix).toEqual([
            [3, 3, -1, 0, 0], [2, 1, 3, -1, -1], [1, -1, 2, 2, -1],
            [-1, 0, 1, 3, 2], [0, 2, -1, -1, 1], [-1, -1, 0, 1, 3],
        ])
        expect(PRODUCTION_CATALOG_AUDIT.catalogSignature).toBe('28340e8792d8a0b6')
        expect(PRODUCTION_CATALOG_AUDIT.candidateId).toBe('balanced-level-v2')
        expect(PRODUCTION_CATALOG_AUDIT.validatedSequences).toBe(720)
    })

    it('scores USE with the explicit level-bonus table and direct event modifier', () => {
        const genes = createInitialGenes()
        genes.RESILIENCE.level = 2
        expect(getValidatedGeneUseBreakdown(getRoundEventById('HEAT_SPIKE'), genes, 'RESILIENCE').total).toBe(3)
        expect(getValidatedGeneUseBreakdown(getRoundEventById('HEAT_SPIKE'), createInitialGenes(), 'METABOLISM').total).toBe(4)
    })

    it('applies cooldown, evolves to cap two, and rejects illegal actions', () => {
        let genes = createInitialGenes()
        for (let roundNumber = 1; roundNumber <= 2; roundNumber += 1) {
            const result = resolveRound({ roundNumber, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'EVOLVE' } })
            genes = result.player1.traits
        }
        expect(genes.METABOLISM.level).toBe(2)
        expect(() => resolveRound({ roundNumber: 3, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'USE' } })).toThrow(/maximum level/i)
        const used = resolveRound({ roundNumber: 3, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'USE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'USE' } })
        expect(used.player1.traits.METABOLISM.cooldown).toBe(1)
    })

    it('persists the rule version and catalog signature with each resolved round', () => {
        const resolution = buildPersistedRoundResolution({
            roundNumber: 1, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Score: 0, player2Score: 0,
            player1Traits: createInitialGenes(), player2Traits: createInitialGenes(),
            player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'USE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'USE' }, startedAt: null,
        })
        expect(resolution.resolution_data.ruleVersion).toBe(RULE_VERSION)
        expect(resolution.resolution_data.catalogSignature).toBe(PRODUCTION_CATALOG_AUDIT.catalogSignature)
    })
})
