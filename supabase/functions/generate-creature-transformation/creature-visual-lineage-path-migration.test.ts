import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
    resolve('supabase/migrations/202608260002_creature_visual_lineage_path.sql'),
    'utf8',
)
const generateFunction = readFileSync(
    resolve('supabase/functions/generate-creature-transformation/index.ts'),
    'utf8',
)
const finalizerFunction = readFileSync(
    resolve('supabase/functions/fal-creature-transformation-finalizer/index.ts'),
    'utf8',
)

describe('creature visual lineage path migration', () => {
    it('walks the parent chain from the active version instead of collecting every version', () => {
        expect(migration).toMatch(/create or replace function public\.list_creature_visual_lineage/i)
        expect(migration).toContain('with recursive lineage as (')
        expect(migration).toContain("where v.creature_id = p_creature_id and v.status = 'ACTIVE'")
        expect(migration).toContain('join lineage child on child.previous_version_id = parent.id')
    })

    it('never reintroduces the status filter that pulled in abandoned branches', () => {
        // 'SUPERSEDED' may be named in the prose above; what must not come back is selecting by it.
        const statements = migration.replace(/^\s*--.*$/gm, '')
        expect(statements).not.toMatch(/status\s+in\s*\(/i)
        expect(statements).not.toContain('SUPERSEDED')
    })

    it('excludes the base version, which is a starting point and not a transformation', () => {
        expect(migration).toContain('where lineage.visual_trait_id is not null')
    })

    it('returns the lineage oldest-first, the order the evolution planner assumes', () => {
        expect(migration).toContain('order by lineage.version_number asc')
    })

    it('bounds the recursion so corrupt data degrades instead of hanging a generation', () => {
        expect(migration).toContain('child.depth < 128')
    })

    it('stays reachable only through the service role', () => {
        expect(migration).toContain('revoke all on function public.list_creature_visual_lineage(uuid)')
        expect(migration).toContain('grant execute on function public.list_creature_visual_lineage(uuid) to service_role')
    })
})

describe('the two edge functions read the same lineage', () => {
    it('both call the lineage routine rather than querying the versions table', () => {
        for (const [name, source] of [
            ['generate-creature-transformation', generateFunction],
            ['fal-creature-transformation-finalizer', finalizerFunction],
        ] as const) {
            expect(source, name).toContain("supabaseAdmin.rpc('list_creature_visual_lineage', {")
            expect(source, name).not.toContain("'version_number, visual_trait_id, evolution_target_id'")
        }
    })

    it('both reconstruct the adopted structural mutations', () => {
        // The finalizer used to drop bodyPlanMutationId, so on that path the canonical body plan
        // silently collapsed back to the starter topology.
        for (const [name, source] of [
            ['generate-creature-transformation', generateFunction],
            ['fal-creature-transformation-finalizer', finalizerFunction],
        ] as const) {
            expect(source, name).toContain('const bodyPlanMutationId = readBodyPlanMutationId(snapshot)')
            expect(source, name).toContain('...(bodyPlanMutationId ? { bodyPlanMutationId } : {}),')
        }
    })
})
