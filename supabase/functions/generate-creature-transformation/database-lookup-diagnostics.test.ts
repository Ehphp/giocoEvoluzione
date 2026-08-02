import { describe, expect, it } from 'vitest'

import { getSafeDatabaseLookupCode } from './database-lookup-diagnostics.ts'

describe('getSafeDatabaseLookupCode', () => {
    it('keeps only a bounded technical database code', () => {
        expect(getSafeDatabaseLookupCode({ code: 'PGRST205', message: 'details that must not be logged' })).toBe('PGRST205')
        expect(getSafeDatabaseLookupCode({ code: '42P01' })).toBe('42P01')
    })

    it('does not derive diagnostics from messages or untrusted values', () => {
        expect(getSafeDatabaseLookupCode({ message: 'invalid input syntax for type uuid: secret-value' })).toBe('UNKNOWN')
        expect(getSafeDatabaseLookupCode({ code: 'unsafe code!' })).toBe('UNKNOWN')
        expect(getSafeDatabaseLookupCode(null)).toBe('UNKNOWN')
    })
})
