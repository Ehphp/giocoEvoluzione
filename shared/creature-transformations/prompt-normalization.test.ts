import { describe, expect, it } from 'vitest'

import { formatPromptList, normalizePromptText, uniquePromptItems, withTerminalPunctuation } from './prompt-normalization.ts'

describe('prompt normalization', () => {
    it('trims whitespace and applies consistent punctuation without changing meaningful text', () => {
        expect(normalizePromptText('  Pelle   morbida ,  con creste  ')).toBe('Pelle morbida, con creste')
        expect(withTerminalPunctuation('Pelle morbida')).toBe('Pelle morbida.')
        expect(withTerminalPunctuation('Pelle morbida!')).toBe('Pelle morbida!')
    })

    it('removes case-insensitive duplicates while retaining semantically distinct entries', () => {
        expect(uniquePromptItems([' Coda corta ', 'coda CORTA', 'Coda', '', '  '])).toEqual(['Coda corta', 'Coda'])
        expect(formatPromptList(['Coda corta', 'Coda', 'coda corta'])).toBe('Coda corta and Coda')
    })
})

