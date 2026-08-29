import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const edgeFunction = readFileSync(resolve('supabase/functions/delete-creature-lineage/index.ts'), 'utf8')
const config = readFileSync(resolve('supabase/config.toml'), 'utf8')

describe('delete creature lineage Edge Function', () => {
    it('deletes through the owner-scoped RPC before calling the Storage API', () => {
        const requestHandler = edgeFunction.slice(edgeFunction.indexOf('Deno.serve('))

        expect(edgeFunction).toContain("authenticatedClient.rpc(\n        'delete_my_creature_lineage'")
        expect(edgeFunction).toContain('.storage\n            .from(CREATURE_TRANSFORMATION_EXPERIMENTS_BUCKET)\n            .remove(batch)')
        expect(requestHandler.indexOf("'delete_my_creature_lineage'")).toBeLessThan(requestHandler.indexOf('removeStorageObjects'))
    })

    it('keeps the function authenticated and filters canonical source assets from removal', () => {
        expect(config).toMatch(/\[functions\.delete-creature-lineage\]\s+verify_jwt = true/m)
        expect(edgeFunction).toContain(".eq('profile_id', authData.user.id)")
        expect(edgeFunction).toContain('collectLineageExperimentObjectPaths')
        expect(edgeFunction).toContain('findRemainingStorageReferences')
    })
})
