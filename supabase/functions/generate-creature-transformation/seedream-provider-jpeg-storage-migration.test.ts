import migration from '../../migrations/202608160003_allow_seedream_jpeg_experiments.sql?raw'
import { describe, expect, it } from 'vitest'

describe('Seedream JPEG storage migration', () => {
    it('allows native provider JPEGs in the private experiments bucket', () => {
        expect(migration).toContain("where id = 'creature-transformation-experiments'")
        expect(migration).toContain("array['image/jpeg', 'image/webp']::text[]")
        expect(migration).toContain('greatest(file_size_limit, 31457280)')
    })

    it('preserves an explicitly unrestricted bucket configuration', () => {
        expect(migration).toContain('when allowed_mime_types is null then null')
    })
})
