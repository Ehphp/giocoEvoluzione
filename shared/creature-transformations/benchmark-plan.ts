import type { TransformationIntensity } from './concepts.ts'
import { VISUAL_TRAIT_IDS, type VisualTraitId } from './visual-traits.ts'

export type CreatureTransformationBenchmarkCase = Readonly<{
    id: string
    visualTraitId: VisualTraitId
    intensity: TransformationIntensity
    conceptSeed: string
    purpose: string
}>

const BENCHMARK_SEED_VERSION = 'creature-transformation-benchmark-v1'

function defineCase(visualTraitId: VisualTraitId, purpose: string): CreatureTransformationBenchmarkCase {
    return Object.freeze({
        id: `baseline-${visualTraitId.toLowerCase().replace(/_/g, '-')}-i2`,
        visualTraitId,
        intensity: 2,
        conceptSeed: `${BENCHMARK_SEED_VERSION}:${visualTraitId}:intensity-2`,
        purpose,
    })
}

export const CREATURE_TRANSFORMATION_BENCHMARK_PLAN = Object.freeze([
    defineCase('IMPACT_ADAPTATION', 'Verifica che le strutture protettive restino locali e non alterino identita o silhouette.'),
    defineCase('LOCOMOTION_ADAPTATION', 'Verifica che le mutazioni degli arti mantengano posa, proporzioni e leggibilita.'),
    defineCase('SENSORY_EXPANSION', 'Stress test controllato della conservazione di volto e occhi.'),
    defineCase('ENERGY_REGULATION', 'Verifica mutazioni integrate su collo, dorso o petto senza reinterpretazione globale.'),
    defineCase('AQUATIC_MORPHOLOGY', 'Verifica che dettagli idrodinamici restino una mutazione e non una nuova specie.'),
] as const satisfies readonly CreatureTransformationBenchmarkCase[])

export const CREATURE_TRANSFORMATION_BENCHMARK_CASE_BY_ID: Readonly<Record<string, CreatureTransformationBenchmarkCase>> = Object.freeze(
    Object.fromEntries(CREATURE_TRANSFORMATION_BENCHMARK_PLAN.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase])),
)

export function getCreatureTransformationBenchmarkCase(id: string): CreatureTransformationBenchmarkCase | null {
    return CREATURE_TRANSFORMATION_BENCHMARK_CASE_BY_ID[id] ?? null
}

export function isInitialCreatureTransformationBenchmarkPlan(): boolean {
    return CREATURE_TRANSFORMATION_BENCHMARK_PLAN.length === VISUAL_TRAIT_IDS.length
        && new Set(CREATURE_TRANSFORMATION_BENCHMARK_PLAN.map((benchmarkCase) => benchmarkCase.visualTraitId)).size === VISUAL_TRAIT_IDS.length
        && CREATURE_TRANSFORMATION_BENCHMARK_PLAN.every((benchmarkCase) => benchmarkCase.intensity === 2)
}
