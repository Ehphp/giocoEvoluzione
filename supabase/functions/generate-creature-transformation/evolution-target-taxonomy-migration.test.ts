import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { EVOLUTION_TARGET_IDS } from '../../../shared/creature-transformations/evolution-targets.ts'
import { DEFAULT_DRAFTABLE_EVOLUTION_TARGET_IDS } from '../../../shared/creature-transformations/evolution-draft.ts'

const migration = readFileSync(resolve('supabase/migrations/202608140001_evolution_target_taxonomy.sql'), 'utf8')

const LEGACY_TARGET_IDS = ['FORELIMBS', 'HIND_LIMBS', 'HEAD_AND_SENSES', 'TORSO_AND_BACK']

describe('evolution target taxonomy migration', () => {
    it('converts every legacy target id once, without deleting historical rows', () => {
        expect(migration).toMatch(/create function public\.map_legacy_evolution_target_id/i)
        for (const legacy of LEGACY_TARGET_IDS) expect(migration).toContain(`when '${legacy}' then`)
        expect(migration).toMatch(/when 'SKIN' then 'SKIN_AND_COVERING'/)
        // Every table that persists a target id is converted.
        for (const table of [
            'creature_visual_progress_tracks',
            'creature_transformation_requests',
            'creature_visual_versions',
            'creature_evolution_target_progress',
            'creature_evolution_target_progress_events',
            'players',
        ]) {
            expect(migration, table).toMatch(new RegExp(`update public\\.${table}`))
        }
        // The snapshot payload is converted too, so the metadata trigger cannot restore a legacy id.
        expect(migration).toMatch(/jsonb_set\(concept_snapshot, '\{evolutionTargetId\}'/)
        expect(migration).not.toMatch(
            /delete from public\.creature_visual_versions|delete from public\.creature_transformation_requests/,
        )
        expect(migration).toMatch(/drop function public\.map_legacy_evolution_target_id/)
        expect(migration).toMatch(
            /disable trigger creature_visual_versions_immutable[\s\S]*update public\.creature_visual_versions[\s\S]*enable trigger creature_visual_versions_immutable/i,
        )
    })

    it('sums the banked wins when two legacy limb counters merge into one', () => {
        expect(migration).toMatch(/array_agg\(id order by id\)\)\[1\] as keep_id/)
        expect(migration).toMatch(/sum\(wins\) as merged_wins/)
        expect(migration).toMatch(
            /delete from public\.creature_evolution_target_progress\s+where id not in \(select keep_id/,
        )
    })

    it('re-applies every constraint and function with the new taxonomy only', () => {
        const newTargets = EVOLUTION_TARGET_IDS.map((target) => `'${target}'`).join(',')

        expect(migration).toContain(`check (evolution_target_id in (${newTargets}))`)
        expect(migration).toContain(`evolution_draft_options <@ array[${newTargets}]::text[]`)
        for (const routine of [
            'draw_evolution_draft_options',
            'get_creature_evolution_target_progress',
            'open_evolution_track_from_ready_target',
            'select_creature_visual_progress_track',
            'resolve_creature_visual_progress_track_trait',
            'reserve_creature_transformation_request',
        ]) {
            expect(migration, routine).toMatch(new RegExp(`function public\\.${routine}`))
        }
        // No legacy id survives in the constraints or in any routine the runtime calls: they
        // only appear in the mapping and in the row filters that select the rows to convert.
        const constraintsAndRoutines = migration.slice(migration.indexOf('3. Re-apply the constraints'))
        for (const legacy of [...LEGACY_TARGET_IDS, 'SKIN']) {
            expect(constraintsAndRoutines, legacy).not.toContain(`'${legacy}'`)
        }
    })

    it('keeps the quota, idempotency and cost semantics of the reservation untouched', () => {
        expect(migration).toContain("return jsonb_build_object('outcome','IDEMPOTENCY_KEY_REUSED')")
        expect(migration).toContain("return jsonb_build_object('outcome','DAILY_LIMIT_REACHED')")
        expect(migration).toContain("return jsonb_build_object('outcome','DAILY_BUDGET_REACHED')")
        expect(migration).toContain("return jsonb_build_object('outcome','REAL_IMAGE_USER_CONCURRENCY_REACHED')")
        expect(migration).toContain("return jsonb_build_object('outcome','REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED')")
        expect(migration).toMatch(
            /pg_advisory_xact_lock\(hashtextextended\(p_profile_id::text \|\| ':' \|\| p_idempotency_key, 0\)\)/,
        )
    })

    it('draws exactly the targets the client accepts, so the battle-start draft keeps being offered', () => {
        // The client drops any option outside the taxonomy: if the database drew a different
        // list the draft overlay would silently never open.
        const drawn = migration
            .slice(migration.indexOf('function public.draw_evolution_draft_options'))
            .match(/unnest\(array\[([^\]]+)\]\)/)![1]!
            .split(',')
            .map((entry) => entry.trim().replaceAll("'", ''))

        expect(drawn).toEqual([...DEFAULT_DRAFTABLE_EVOLUTION_TARGET_IDS])
        drawn.forEach((target) => expect(EVOLUTION_TARGET_IDS).toContain(target))
    })

    it('requires an evolution target when a track is opened', () => {
        expect(migration).toMatch(/if p_visual_trait_id is not null then raise exception 'VISUAL_TRACK_STATE_CONFLICT'/)
        expect(migration).toMatch(/if p_evolution_target_id is null or p_evolution_target_id not in/)
    })
})
