import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchEvolutionTargetProgressMock, getCreatureVisualProgressMock } = vi.hoisted(() => ({
    fetchEvolutionTargetProgressMock: vi.fn(),
    getCreatureVisualProgressMock: vi.fn(),
}))

vi.mock('../../lib/creature-transformations-api', () => ({
    CreatureTransformationApiError: class CreatureTransformationApiError extends Error {
        code = ''
    },
    adoptCreatureTransformation: vi.fn(),
    createVisualTransformationIdempotencyKey: vi.fn(),
    discardCreatureTransformation: vi.fn(),
    generateUnlockedCreatureTransformation: vi.fn(),
    getCreatureTransformationRequestStatus: vi.fn(),
    getCreatureVisualProgress: getCreatureVisualProgressMock,
    getCurrentCreatureVisual: vi.fn(),
    submitBackgroundRemovalCandidate: vi.fn(),
}))

vi.mock('../../lib/evolution-progress-api', () => ({
    fetchEvolutionTargetProgress: fetchEvolutionTargetProgressMock,
    openEvolutionTrackFromReadyTarget: vi.fn(),
}))

import { CreatureVisualProgressionScreen } from './CreatureVisualProgressionScreen'

const CREATURE = {
    id: 'creature',
    profile_id: 'profile',
    lineage_id: 'lineage',
    base_creature_key: 'VERDANT_HATCHLING' as const,
    name: 'Verdy',
    level: 1,
    experience: 0,
    progression_state: {},
    heightMeters: 1.4,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
}

describe('CreatureVisualProgressionScreen', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        getCreatureVisualProgressMock.mockResolvedValue({
            track: {
                id: 'completed-track',
                status: 'COMPLETED',
                visualTraitId: 'ANATOMICAL_EVOLUTION',
                evolutionTargetId: 'TAIL',
                progress: 3,
                target: 3,
                generatedRequestId: null,
            },
            lastExperiment: null,
            lastFailure: null,
            currentVersion: { id: 'visual-6', versionNumber: 6, visualTraitId: 'ANATOMICAL_EVOLUTION', evolutionTargetId: 'TAIL', conceptName: 'Coda evoluta' },
            history: [],
            bodyPlan: { id: 'quadruped', label: 'Quadrupede', availableEvolutionTargets: ['TAIL'], adoptedBodyPlanMutationIds: [] },
        })
        fetchEvolutionTargetProgressMock.mockResolvedValue([
            { evolutionTargetId: 'TAIL', wins: 3, target: 3 },
        ])
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
        vi.clearAllMocks()
    })

    it('opens the target picker instead of the completed-track summary when entered from the evolution CTA', async () => {
        act(() => {
            root.render(createElement(CreatureVisualProgressionScreen, {
                creature: CREATURE,
                entryPoint: 'target-picker',
                onBack: vi.fn(),
                onVisualChanged: vi.fn(),
            }))
        })

        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(container.textContent).toContain('Tratti da evolvere')
        expect(container.textContent).not.toContain('Evoluzione adottata')
        expect([...container.querySelectorAll('button')].some((button) => button.textContent?.includes('Scegli'))).toBe(true)
    })
})
