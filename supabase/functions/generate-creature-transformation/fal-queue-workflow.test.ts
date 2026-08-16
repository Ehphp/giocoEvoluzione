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
        expect(parseFalQueueWorkflow({
            version: 1,
            kind: 'SEEDREAM_PRODUCTION',
            source: { kind: 'CANONICAL', path: 'creatures/source.png', isBaseVersion: true },
            parameters: { imageSize: { width: 1920, height: 2880 }, seed: 1 },
        })).toBeNull()
    })
})
