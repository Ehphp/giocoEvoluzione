// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), progress: vi.fn(), status: vi.fn(), submit: vi.fn(), removeBackground: vi.fn(), normalize: vi.fn(), display: vi.fn() }))
vi.mock('../../lib/creature-transformations-api', () => ({
    createVisualTransformationIdempotencyKey: () => 'chain-key', generateFluxEvolutionChainStep: mocks.generate,
    getCreatureVisualProgress: mocks.progress, getCreatureTransformationRequestStatus: mocks.status,
    submitBackgroundRemovalCandidate: mocks.submit,
}))
vi.mock('../../lib/remove-creature-background', () => ({ removeCreatureBackground: mocks.removeBackground }))
vi.mock('../../lib/normalize-creature-master', () => ({ normalizeCreatureMasterPng: mocks.normalize }))
vi.mock('../../lib/creature-display-asset', () => ({ createCreatureDisplayAsset: mocks.display }))

import { FluxEvolutionChainSimulator } from './FluxEvolutionChainSimulator'

describe('FluxEvolutionChainSimulator', () => {
    let container: HTMLDivElement
    beforeEach(() => {
        window.localStorage.clear()
        mocks.progress.mockResolvedValue({ currentVersion: { id: '00000000-0000-4000-8000-000000000001', versionNumber: 1 }, history: [] })
        mocks.generate.mockResolvedValue({ success: true, accepted: true, requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000002', status: 'RUNNING' } })
        mocks.status.mockResolvedValue({ requestPersistence: { status: 'RUNNING' } })
        container = document.createElement('div'); document.body.append(container)
    })
    afterEach(() => container.remove())

    it('stops locally after the active job and prevents pending generations from being launched', async () => {
        const root = createRoot(container)
        await act(async () => { root.render(createElement(FluxEvolutionChainSimulator, { creatureId: 'creature-1' })) })
        await act(async () => { [...container.querySelectorAll('button')].find((button) => button.textContent === 'Simula catena evolutiva')!.click() })
        expect(mocks.generate).toHaveBeenCalledTimes(1)
        expect(mocks.generate).toHaveBeenCalledWith(expect.not.objectContaining({ sourceVisualVersionId: expect.anything() }))
        await act(async () => { [...container.querySelectorAll('button')].find((button) => button.textContent === 'Stop simulation')!.click() })
        expect(container.textContent).toContain('Stato: stopped')
        expect(JSON.parse(window.localStorage.getItem('flux-evolution-chain-simulator:creature-1')!).steps.slice(1).every((step: { state: string }) => step.state === 'stopped')).toBe(true)
        await act(async () => root.unmount())
    })

    it('starts browser post-processing once for a completed request despite the state rerender', async () => {
        const raw = new Blob(['raw'], { type: 'image/png' })
        let resolveRemoval: ((result: Blob) => void) | undefined
        mocks.status.mockResolvedValue({ requestPersistence: { status: 'SUCCEEDED' }, rawResult: { signedUrl: 'https://signed.example/raw.png' } })
        mocks.removeBackground.mockReturnValue(new Promise<Blob>((resolve) => { resolveRemoval = resolve }))
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => raw })))
        const root = createRoot(container)

        await act(async () => { root.render(createElement(FluxEvolutionChainSimulator, { creatureId: 'creature-1' })) })
        await act(async () => {
            [...container.querySelectorAll('button')].find((button) => button.textContent === 'Simula catena evolutiva')!.click()
            await Promise.resolve()
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(mocks.removeBackground).toHaveBeenCalledTimes(1)
        resolveRemoval?.(raw)
        await act(async () => root.unmount())
        vi.unstubAllGlobals()
    })
})
