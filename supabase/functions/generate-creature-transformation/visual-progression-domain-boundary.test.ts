import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('visual progression architectural boundary', () => {
    it('keeps the shared visual domain independent from competitive gene vocabulary', () => {
        const source = readFileSync(resolve('shared/creature-transformations/visual-progression.ts'), 'utf8')
        expect(source).not.toMatch(/AdaptationId|FEROCITY|ARMOR|AGILITY|SENSES|CAMOUFLAGE|\bUSE\b|\bEVOLVE\b/)
    })
})
