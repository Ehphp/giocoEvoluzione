import { RULE_VERSION } from '../shared/game-rules/index.ts'
export const AUDIT_RULE_VERSION = RULE_VERSION
export const AUDIT_FITNESS_VERSION = `${RULE_VERSION}-diagnostics`
export const AUDIT_SEED = 0x5eed2026
export const ACCEPTANCE_CONFIG = { maximumGenePickRate: 0.35, minimumGenePickRate: 0.10, minimumEvolveRate: 0.10, maximumEvolveRate: 0.35, maximumPositionDifference: 0.08 } as const
