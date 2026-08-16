import { describe, expect, it } from 'vitest'

import migration from '../../migrations/202608160004_allow_seedream_jpeg_background_removal.sql?raw'

describe('Seedream JPEG background-removal migration', () => {
    it('allows only a provider JPEG raw before promotion to the final PNG master', () => {
        expect(migration).toContain("'/[a-f0-9]{64}\\.(png|jpg)$')")
        expect(migration).toContain("v_request.result_mime_type not in ('image/png', 'image/jpeg')")
        expect(migration).toContain("p_candidate_mime_type <> 'image/png'")
        expect(migration).toContain('p_candidate_width <> 1024 or p_candidate_height <> 1536')
    })
})
