import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202608050001_security_hardening.sql'), 'utf8')
const authProvider = readFileSync(resolve(process.cwd(), 'src/auth/AuthProvider.tsx'), 'utf8')
const authScreen = readFileSync(resolve(process.cwd(), 'src/screens/auth/AuthScreen.tsx'), 'utf8')

describe('security hardening regression controls', () => {
    it('disables public signup, keeps user routes on JWT and makes Fal callbacks explicit exceptions', () => {
        expect(config).toMatch(/\[functions\.resolve-round\][\s\S]*verify_jwt\s*=\s*true/)
        expect(config).toMatch(/\[functions\.generate-creature-transformation\][\s\S]*verify_jwt\s*=\s*true/)
        expect(config).toMatch(/\[functions\.fal-creature-transformation-webhook\][\s\S]*verify_jwt\s*=\s*false/)
        expect(config).toMatch(/\[functions\.fal-creature-transformation-finalizer\][\s\S]*verify_jwt\s*=\s*false/)
        expect([...config.matchAll(/^enable_signup\s*=\s*(\w+)/gm)].map((match) => match[1])).toEqual(['false', 'false', 'false'])
        expect(authProvider).not.toContain('.auth.signUp(')
        expect(authScreen).not.toContain('Registrati')
    })

    it('keeps sensitive game mutation and image authorization server-side', () => {
        expect(migration).toContain('add column if not exists can_generate_images boolean not null default false')
        expect(migration).toContain('revoke all privileges on table public.games, public.players, public.round_actions, public.round_results from public, anon, authenticated')
        expect(migration).toContain('create policy "game participants read games"')
        expect(migration).toContain('create or replace function public.submit_game_round_action')
        expect(migration).toContain('p_daily_real_image_limit')
        expect(migration).toContain('REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED')
        expect(migration).toContain('p_real_image_cooldown_seconds')
    })
})
