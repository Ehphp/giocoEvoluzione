import { describe, expect, it } from 'vitest'
import {
    emptyExperimentBucket,
    listAllStorageObjectPaths,
    parseResetArguments,
    requireServiceRoleKey,
    resetCreatureEvolutionEnvironment,
    serviceRoleFetch,
    type StorageBucketClient,
} from './reset-creature-evolution-environment.ts'

type Entry = Readonly<{ name: string; id: string | null }>

function bucketWithTree(initialPaths: readonly string[]): StorageBucketClient & { removed: string[][] } {
    const paths = new Set(initialPaths)
    const removed: string[][] = []
    return {
        removed,
        async list(folder = '', options = {}) {
            const children = new Map<string, Entry>()
            const prefix = folder ? `${folder}/` : ''
            for (const path of paths) {
                if (!path.startsWith(prefix)) continue
                const remainder = path.slice(prefix.length)
                const [name, ...rest] = remainder.split('/')
                if (!name) continue
                children.set(name, { name, id: rest.length ? null : `id-${path}` })
            }
            const offset = options.offset ?? 0
            const limit = options.limit ?? 100
            return {
                data: [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit),
                error: null,
            }
        },
        async remove(removalPaths) {
            removed.push([...removalPaths])
            for (const path of removalPaths) paths.delete(path)
            return { data: null, error: null }
        },
    }
}

const cleanVerification = {
    canonical_creature_violations: 0,
    profiles_without_creature: 0,
    active_lineage_violations: 0,
    active_visual_violations: 0,
    extra_visual_versions: 0,
    transformation_requests_remaining: 0,
    visual_tracks_remaining: 0,
    target_progress_remaining: 0,
    evolution_events_remaining: 0,
    evolution_reviews_remaining: 0,
    orphan_lineages: 0,
    noncanonical_lineages: 0,
    evolution_drafts_remaining: 0,
    flux_start_violations: 0,
}

describe('reset-creature-evolution-environment', () => {
    it('fails closed without the exact destructive confirmation', () => {
        expect(() => parseResetArguments([])).toThrow('confirm-destructive-reset')
        expect(() => parseResetArguments(['--confirm-destructive-reset', '--other'])).toThrow(
            'confirm-destructive-reset',
        )
        expect(() => parseResetArguments(['--confirm-destructive-reset'])).not.toThrow()
    })

    it('rejects a publishable key before any destructive request', () => {
        expect(() => requireServiceRoleKey('sb_publishable_not-an-admin-key')).toThrow('sb_publishable_')
        expect(requireServiceRoleKey('  sb_secret_admin-key  ')).toBe('sb_secret_admin-key')
    })

    it('sends modern sb_secret keys to Storage as apikey only, never as a JWT bearer', async () => {
        let receivedHeaders: Headers | null = null
        const baseFetch: typeof fetch = async (_input, init) => {
            receivedHeaders = new Headers(init?.headers)
            return new Response(null, { status: 200 })
        }
        const fetchForSecret = serviceRoleFetch('sb_secret_test', baseFetch)
        await fetchForSecret('https://example.test/storage/v1', {
            headers: { apikey: 'sb_secret_test', Authorization: 'Bearer sb_secret_test' },
        })

        expect(receivedHeaders?.get('apikey')).toBe('sb_secret_test')
        expect(receivedHeaders?.has('authorization')).toBe(false)
    })

    it('lists nested storage folders across pages and removes every physical object', async () => {
        const paths = [
            ...Array.from({ length: 101 }, (_, index) => `display/${String(index).padStart(3, '0')}.webp`),
            'candidates/first.png',
            'experiments/raw/a/result.png',
            'cleanup/old.png',
            'legacy/root.png',
        ]
        const bucket = bucketWithTree(paths)

        expect(await listAllStorageObjectPaths(bucket)).toEqual(paths.slice().sort())
        await expect(emptyExperimentBucket(bucket)).resolves.toEqual({ deleted: paths.length, remaining: 0 })
        expect(await listAllStorageObjectPaths(bucket)).toEqual([])
        expect(bucket.removed.flat()).toHaveLength(paths.length)
    })

    it('starts only after canonical-source preflight and verifies the fresh Flux base state', async () => {
        const source = bucketWithTree(['verdant-hatchling-v1.png'])
        const experiments = bucketWithTree(['display/v1.webp', 'experiments/raw/old.png'])
        const rpcCalls: string[] = []
        const supabase = {
            storage: {
                from: (bucket: string) => (bucket === 'creature-transformation-sources' ? source : experiments),
            },
            async rpc(name: string) {
                rpcCalls.push(name)
                if (name === 'admin_destructive_reset_creature_evolution_environment') {
                    return {
                        data: {
                            transformation_requests_deleted: 3,
                            visual_versions_deleted: 4,
                            visual_tracks_deleted: 2,
                            target_progress_deleted: 1,
                            evolution_events_deleted: 5,
                            evolution_reviews_deleted: 2,
                            lineages_deleted: 2,
                            creatures_reset: 1,
                            verification: cleanVerification,
                        },
                        error: null,
                    }
                }
                return { data: cleanVerification, error: null }
            },
        }

        await expect(resetCreatureEvolutionEnvironment(supabase)).resolves.toMatchObject({
            storageObjectsDeleted: 2,
            storageObjectsRemaining: 0,
            transformationRequestsDeleted: 3,
            creaturesReset: 1,
        })
        expect(rpcCalls).toEqual([
            'admin_destructive_reset_creature_evolution_environment',
            'admin_verify_creature_evolution_environment_reset',
        ])
    })
})
