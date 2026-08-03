import { describe, expect, it } from 'vitest'

import { CREATURE_TRANSFORMATION_BENCHMARK_PLAN, isInitialCreatureTransformationBenchmarkPlan } from './benchmark-plan.ts'
import { VISUAL_TRAIT_IDS } from './visual-traits.ts'

describe('initial creature transformation benchmark plan', () => {
    it('contains exactly five deterministic intensity-2 cases and covers every visual trait once', () => {
        expect(isInitialCreatureTransformationBenchmarkPlan()).toBe(true)
        expect(CREATURE_TRANSFORMATION_BENCHMARK_PLAN).toHaveLength(5)
        expect(CREATURE_TRANSFORMATION_BENCHMARK_PLAN.map((benchmarkCase) => benchmarkCase.visualTraitId).sort()).toEqual([...VISUAL_TRAIT_IDS].sort())
        expect(CREATURE_TRANSFORMATION_BENCHMARK_PLAN.every((benchmarkCase) => benchmarkCase.intensity === 2 && benchmarkCase.conceptSeed.startsWith('creature-transformation-benchmark-v1:'))).toBe(true)
        expect(new Set(CREATURE_TRANSFORMATION_BENCHMARK_PLAN.map((benchmarkCase) => benchmarkCase.id)).size).toBe(5)
    })
})
