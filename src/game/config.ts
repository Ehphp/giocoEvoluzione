import { GENE_CATALOG } from '../../shared/game-rules/catalog.ts'
import { createInitialGenes, generateRoundEventSequence, getGeneLabel, normalizeGeneCollection } from '../../shared/game-rules/state.ts'
import { GENE_IDS, type GeneCollection, type GeneId } from '../../shared/game-rules/types.ts'

export const TRAITS = GENE_IDS
export const TOTAL_ROUNDS = 6
export const FINAL_ROUND_NUMBER = 6
export const FINAL_ROUND_POINTS = 1
export const DEFAULT_ROUND_POINTS = 1
export const BASE_USE_VALUE = 1
export const MAX_TRAIT_LEVEL = 3
export const ROOM_CODE_LENGTH = 5
export const TRAIT_LABELS: Record<GeneId, string> = Object.fromEntries(GENE_IDS.map((gene) => [gene, getGeneLabel(gene)])) as Record<GeneId, string>
export const CREATURE_ASSETS = {
    BASE: '/assets/creatures/base.png',
    RESILIENCE: '/assets/game-ui/genes/gene-resilience.svg',
    MOBILITY: '/assets/game-ui/genes/gene-mobility.svg',
    SENSES: '/assets/game-ui/genes/gene-senses.svg',
    METABOLISM: '/assets/game-ui/genes/gene-metabolism.svg',
    AQUATIC: '/assets/game-ui/genes/gene-aquatic.svg',
} as const
export type DominantTrait = GeneId | 'BASE'
export function createInitialTraits(): GeneCollection { return createInitialGenes() }
export { generateRoundEventSequence }
export function normalizeTraitCollection(value: Partial<Record<GeneId, { level?: unknown; cooldown?: unknown }>> | null | undefined): GeneCollection {
    return normalizeGeneCollection(value as Partial<Record<GeneId, { level?: number; cooldown?: number }>>)
}
export function getDominantTrait(traits: Partial<Record<GeneId, { level?: number } | null>> | null | undefined, previous?: DominantTrait): DominantTrait {
    const levels = GENE_IDS.map((trait) => ({ trait, level: Number.isFinite(traits?.[trait]?.level) ? traits![trait]!.level! : 0 }))
    const max = Math.max(0, ...levels.map((entry) => entry.level))
    const candidates = levels.filter((entry) => entry.level === max).map((entry) => entry.trait)
    if (!max) return 'BASE'
    if (previous && previous !== 'BASE' && candidates.includes(previous)) return previous
    return candidates[0] ?? 'BASE'
}
export { GENE_CATALOG as TRAIT_CATALOG }
