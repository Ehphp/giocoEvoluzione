import { describe, expect, it } from 'vitest'

import { isCreatureTransformationBenchmarkVisible } from './lab-benchmark-flag.ts'

describe('benchmark laboratory frontend flag', () => {
    it('keeps the benchmark hidden unless explicitly enabled', () => {
        expect(isCreatureTransformationBenchmarkVisible(undefined)).toBe(false)
        expect(isCreatureTransformationBenchmarkVisible(false)).toBe(false)
        expect(isCreatureTransformationBenchmarkVisible('true')).toBe(true)
    })
})
