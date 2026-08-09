import { describe, expect, it } from 'vitest'

import { EVOLUTION_TARGET_IDS } from './evolution-targets.ts'
import {
    DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED,
    EVOLUTION_DRAFT_OPTION_COUNT,
    awardedEvolutionTargetWin,
    completeEvolutionTargetProgress,
    drawEvolutionDraftOptions,
    isChoosableEvolutionTarget,
    isEvolutionTargetReady,
    normalizeEvolutionDraftOptions,
    readEvolutionTargetWinsRequired,
} from './evolution-draft.ts'

function sequence(values: number[]): () => number {
    let index = 0

    return () => values[index++ % values.length]!
}

describe('evolution draft', () => {
    it('draws two distinct targets from the catalogue', () => {
        for (let seed = 0; seed < 40; seed += 1) {
            const options = drawEvolutionDraftOptions(sequence([seed / 40, (seed * 7 % 40) / 40, .5, .1]))

            expect(options).toHaveLength(EVOLUTION_DRAFT_OPTION_COUNT)
            expect(new Set(options).size).toBe(EVOLUTION_DRAFT_OPTION_COUNT)
            options.forEach((option) => expect(EVOLUTION_TARGET_IDS).toContain(option))
        }
    })

    it('is deterministic for a given random source', () => {
        const first = drawEvolutionDraftOptions(sequence([.1, .9, .4, .7, .2]))
        const second = drawEvolutionDraftOptions(sequence([.1, .9, .4, .7, .2]))

        expect(first).toEqual(second)
    })

    it('accepts a choice only among the options the player was offered', () => {
        expect(isChoosableEvolutionTarget(['TAIL', 'SKIN'], 'TAIL')).toBe(true)
        expect(isChoosableEvolutionTarget(['TAIL', 'SKIN'], 'FORELIMBS')).toBe(false)
        expect(isChoosableEvolutionTarget(['TAIL', 'SKIN'], 'NOT_A_TARGET')).toBe(false)
        expect(isChoosableEvolutionTarget(['TAIL', 'SKIN'], null)).toBe(false)
    })

    it('drops anything that is not a known target when reading persisted options', () => {
        expect(normalizeEvolutionDraftOptions(['TAIL', 'nope', 42, 'SKIN'])).toEqual(['TAIL', 'SKIN'])
        expect(normalizeEvolutionDraftOptions(null)).toEqual([])
        expect(normalizeEvolutionDraftOptions('TAIL')).toEqual([])
    })

    it('credits a win only to the winner', () => {
        expect(awardedEvolutionTargetWin('WIN')).toBe(1)
        expect(awardedEvolutionTargetWin('LOSS')).toBe(0)
        expect(awardedEvolutionTargetWin('DRAW')).toBe(0)
    })

    it('marks a target ready once its wins reach the threshold', () => {
        expect(isEvolutionTargetReady({ wins: 2, target: 3 })).toBe(false)
        expect(isEvolutionTargetReady({ wins: 3, target: 3 })).toBe(true)
        expect(isEvolutionTargetReady({ wins: 4, target: 3 })).toBe(true)
    })

    it('reports every target, including those never accumulated on', () => {
        const progress = completeEvolutionTargetProgress([{ evolutionTargetId: 'TAIL', wins: 2, target: 3 }])

        expect(progress).toHaveLength(EVOLUTION_TARGET_IDS.length)
        expect(progress.find((entry) => entry.evolutionTargetId === 'TAIL')).toEqual({ evolutionTargetId: 'TAIL', wins: 2, target: 3 })
        expect(progress.find((entry) => entry.evolutionTargetId === 'SKIN')).toEqual({
            evolutionTargetId: 'SKIN',
            wins: 0,
            target: DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED,
        })
    })

    it('falls back to the default threshold for an unusable configured value', () => {
        expect(readEvolutionTargetWinsRequired('5')).toBe(5)
        expect(readEvolutionTargetWinsRequired('0')).toBe(DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED)
        expect(readEvolutionTargetWinsRequired('abc')).toBe(DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED)
        expect(readEvolutionTargetWinsRequired(undefined)).toBe(DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED)
    })
})
