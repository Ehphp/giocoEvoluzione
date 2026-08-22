import { describe, expect, it } from 'vitest'

import { parseFalQueueWorkflow } from './fal-queue-workflow.ts'

describe('Fal queue workflow', () => {
    it('persists the Seedream production contract independently of the active provider flag', () => {
        const workflow = parseFalQueueWorkflow({
            version: 1,
            kind: 'SEEDREAM_PRODUCTION',
            source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
            parameters: { imageSize: { width: 1920, height: 2880 } },
        })

        expect(workflow).toEqual({
            version: 1,
            kind: 'SEEDREAM_PRODUCTION',
            source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
            parameters: { imageSize: { width: 1920, height: 2880 } },
        })
    })

    it('rejects Lab-only controls in a production Seedream workflow', () => {
        expect(
            parseFalQueueWorkflow({
                version: 1,
                kind: 'SEEDREAM_PRODUCTION',
                source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
                parameters: { imageSize: { width: 1920, height: 2880 }, seed: 1 },
            }),
        ).toBeNull()
    })

    /**
     * A request submitted before the FLUX/diagnostic removal and finalized after it is deliberately
     * unparsable: the finalizer then marks it failed and restores its visual track, rather than
     * finalizing a workflow whose provider branch no longer exists.
     */
    it('refuses the retired FLUX and diagnostic workflow kinds', () => {
        expect(
            parseFalQueueWorkflow({
                version: 1,
                kind: 'FLUX',
                source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
            }),
        ).toBeNull()

        expect(
            parseFalQueueWorkflow({
                version: 1,
                kind: 'SEEDREAM_DIAGNOSTIC',
                chainMode: 'NONE',
                chainStep: 1,
                experimentMode: 'dynamic-concept-locked-prompt',
                parameters: { imageSize: 'auto_4K' },
            }),
        ).toBeNull()
    })

    it('refuses a malformed or unversioned workflow instead of coercing it', () => {
        expect(parseFalQueueWorkflow(null)).toBeNull()
        expect(parseFalQueueWorkflow({ kind: 'SEEDREAM_PRODUCTION' })).toBeNull()
        expect(
            parseFalQueueWorkflow({
                version: 2,
                kind: 'SEEDREAM_PRODUCTION',
                source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
                parameters: { imageSize: { width: 1920, height: 2880 } },
            }),
        ).toBeNull()
        // A named provider size was only ever valid in the diagnostic contract.
        expect(
            parseFalQueueWorkflow({
                version: 1,
                kind: 'SEEDREAM_PRODUCTION',
                source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
                parameters: { imageSize: 'auto_4K' },
            }),
        ).toBeNull()
    })
})
