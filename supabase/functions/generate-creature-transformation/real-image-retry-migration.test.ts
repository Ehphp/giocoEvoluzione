import migration from '../../migrations/202608050007_allow_real_image_retry_after_failure.sql?raw'
import { describe, expect, it } from 'vitest'

describe('real image retry migration', () => {
    it('allows a new fingerprint reservation after a terminal provider failure', () => {
        expect(migration).toContain("and status in ('RESERVED', 'RUNNING', 'SUCCEEDED')")
        expect(migration).toContain("and status in ('RESERVED', 'RUNNING', 'SUCCEEDED');")
        expect(migration).not.toContain("and status in ('RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED')")
    })
})
