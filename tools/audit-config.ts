export const AUDIT_RULE_VERSION = 'five-genes-v2'
export const AUDIT_FITNESS_VERSION = 'five-genes-fitness-v2'
export const AUDIT_SEED = 0x5eed2026

export const SCREENING_CONFIG = {
    seed: AUDIT_SEED,
    sampleSequences: 24,
    promotionCount: 5,
    minimumScreeningScore: 0.35,
    maximumCandidates: 30,
} as const

// The categories are intentionally disjoint: raw metrics remain available to
// detect correlations instead of counting the same symptom twice.
export const FITNESS_CONFIG = {
    version: AUDIT_FITNESS_VERSION,
    weights: {
        geneBalance: 0.24,
        decisionDepth: 0.14,
        evolveUtility: 0.12,
        cooldownRelevance: 0.10,
        futureInformation: 0.12,
        drawRate: 0.10,
        policyDominance: 0.10,
        orderRobustness: 0.08,
    },
    targets: {
        maximumPickConcentration: 0.30,
        minimumEvolveRate: 0.08,
        minimumCooldownForcedChoices: 0.05,
        drawRate: 0.25,
        maximumPolicyWinRate: 0.60,
        maximumOrderSpread: 0.22,
    },
} as const
