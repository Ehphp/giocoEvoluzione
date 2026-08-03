import { describe, expect, it } from 'vitest'

import migration from '../../migrations/202608030001_creature_transformation_benchmark_reviews.sql?raw'
import colorEvolutionMigration from '../../migrations/202608050004_creature_transformation_color_evolution_reviews.sql?raw'

describe('benchmark and review migration', () => {
    it('persists only controlled benchmark audit metadata and never promotes a creature', () => {
        expect(migration).toContain('add column benchmark_case_id')
        expect(migration).toContain('add column generation_profile_id')
        expect(migration).toContain('add column concept_seed')
        expect(migration).toContain('add column prompt_sha256')
        expect(migration).toContain('add column concept_snapshot jsonb')
        expect(migration).toContain('add column generation_quality')
        expect(migration).not.toMatch(/prompt\s+text|signed_url|api_key|bytea/i)
        expect(migration).not.toMatch(/update\s+public\.player_creatures/i)
        expect(migration).not.toMatch(/promotion|promote.*asset/i)
    })

    it('defines score-constrained RLS reviews with a service-role-only idempotent upsert', () => {
        expect(migration).toContain('create table public.creature_transformation_experiment_reviews')
        expect(migration).toContain('unique (transformation_request_id, reviewer_profile_id)')
        expect(migration).toContain('identity_preservation_score smallint not null check (identity_preservation_score between 1 and 5)')
        expect(migration).toContain("verdict text not null check (verdict in ('REJECTED', 'PROMISING', 'ACCEPTABLE_EXPERIMENT', 'FINAL_ASSET_CANDIDATE'))")
        expect(migration).toContain('alter table public.creature_transformation_experiment_reviews enable row level security')
        expect(migration).toContain('revoke all on table public.creature_transformation_experiment_reviews from public, anon, authenticated')
        expect(migration).toContain('grant all privileges on table public.creature_transformation_experiment_reviews to service_role')
        expect(migration).toContain('on conflict (transformation_request_id, reviewer_profile_id) do update')
        expect(migration).not.toMatch(/grant\s+.*creature_transformation_experiment_reviews\s+to\s+authenticated/i)
    })

    it('adds precise colour-evolution review flags while retaining historic palette observations', () => {
        expect(colorEvolutionMigration).toContain('UNREQUESTED_PALETTE_CHANGE')
        expect(colorEvolutionMigration).toContain('COLOR_EVOLUTION_TOO_WEAK')
        expect(colorEvolutionMigration).toContain('COLOR_EVOLUTION_INCOHERENT')
        expect(colorEvolutionMigration).toContain('PALETTE_CHANGED')
        expect(colorEvolutionMigration).toContain('create or replace function public.upsert_creature_transformation_experiment_review')
    })
})
