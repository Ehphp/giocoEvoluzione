// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ run: vi.fn(), status: vi.fn() }))
vi.mock('../../lib/creature-transformations-api', () => ({
    createVisualTransformationIdempotencyKey: () => 'seedream-key',
    getCreatureTransformationRequestStatus: mocks.status,
    runSeedreamDiagnostic: mocks.run,
}))

import { SeedreamDiagnosticPanel } from './SeedreamDiagnosticPanel'

describe('SeedreamDiagnosticPanel', () => {
    let container: HTMLDivElement | null = null

    beforeEach(() => {
        window.localStorage.clear()
        mocks.run.mockReset()
        mocks.status.mockReset()
    })

    afterEach(() => {
        container?.remove()
        container = null
    })

    it('switches cleanly between the five diagnostic input modes', async () => {
        container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        await act(async () => { root.render(createElement(SeedreamDiagnosticPanel, { creatureId: 'creature-1' })) })

        expect(container.textContent).toContain('Prompt fisso · Test A')
        const testSelector = container.querySelector('select') as HTMLSelectElement
        await act(async () => {
            testSelector.value = 'FIXED_MICRO_CONCEPT'
            testSelector.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(container.textContent).toContain('Micro-concept fisso · Test B')
        expect(container.textContent).toContain('Dettagli visuali · uno per riga')

        await act(async () => {
            testSelector.value = 'REAL_MICRO_CONCEPT'
            testSelector.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(container.textContent).not.toContain('Prompt fisso · Test A')
        expect(container.textContent).not.toContain('Micro-concept fisso · Test B')
        expect(container.textContent).toContain('C · Micro-concept reale + FLUX v7')

        await act(async () => {
            testSelector.value = 'fixed-concept-locked-prompt'
            testSelector.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(container.textContent).toContain('Prompt completo lockato · Test D')
        const targetSelector = container.querySelectorAll('select')[2] as HTMLSelectElement
        expect(targetSelector.value).toBe('HEAD_AND_CROWN')
        expect(targetSelector.disabled).toBe(true)

        await act(async () => {
            testSelector.value = 'dynamic-concept-locked-prompt'
            testSelector.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(container.textContent).toContain('Prompt completo lockato · Test E')

        await act(async () => root.unmount())
    })

    it('requires a local PNG or JPEG before it can start a diagnostic', async () => {
        container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        await act(async () => { root.render(createElement(SeedreamDiagnosticPanel, { creatureId: 'creature-1' })) })

        const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent === 'Avvia diagnosi Seedream')!
        await act(async () => { button.click() })

        expect(container.textContent).toContain('Carica una sorgente PNG o JPEG per la diagnosi.')
        expect(mocks.run).not.toHaveBeenCalled()
        await act(async () => root.unmount())
    })

    it('submits the uploaded source only to the isolated Seedream operation', async () => {
        const createObjectUrl = vi.fn(() => 'blob:source')
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
        mocks.run.mockResolvedValue({ success: true, accepted: true, requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000002', status: 'RUNNING' } })
        mocks.status.mockResolvedValue({ success: true, requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000002', status: 'RUNNING', createdAt: '2026-01-01T00:00:00.000Z' } })
        container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        await act(async () => { root.render(createElement(SeedreamDiagnosticPanel, { creatureId: 'creature-1' })) })
        const testSelector = container.querySelector('select') as HTMLSelectElement
        await act(async () => {
            testSelector.value = 'REAL_MICRO_CONCEPT'
            testSelector.dispatchEvent(new Event('change', { bubbles: true }))
        })

        const source = new File([], 'sorgente.png', { type: 'image/png' })
        Object.defineProperty(source, 'arrayBuffer', { value: async () => new Uint8Array([137, 80, 78, 71]).buffer })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        Object.defineProperty(input, 'files', { configurable: true, value: [source] })
        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await Promise.resolve()
        })
        expect(createObjectUrl).toHaveBeenCalledWith(source)
        const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent === 'Avvia diagnosi Seedream')!
        await act(async () => { button.click() })

        expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({
            operation: 'RUN_SEEDREAM_DIAGNOSTIC', creatureId: 'creature-1', experimentMode: 'REAL_MICRO_CONCEPT',
            source: expect.objectContaining({ mimeType: 'image/png' }),
        }))
        expect(window.localStorage.getItem('seedream-diagnostic-panel:creature-1')).toBe('00000000-0000-4000-8000-000000000002')
        await act(async () => root.unmount())
    })

    it('restores the last server-owned diagnostic after a page refresh', async () => {
        window.localStorage.setItem('seedream-diagnostic-panel:creature-1', '00000000-0000-4000-8000-000000000003')
        mocks.status.mockResolvedValue({
            success: true,
            requestPersistence: { transformationRequestId: '00000000-0000-4000-8000-000000000003', status: 'SUCCEEDED', createdAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:03.000Z' },
            generation: { provider: 'fal.ai', model: 'fal-ai/bytedance/seedream/v4.5/edit', latencyMs: 3000 },
            prompt: { text: 'Prompt persistito', sha256: 'abc' },
            result: { signedUrl: 'https://signed.example/seedream.png', expiresAt: '2026-01-01T01:00:00.000Z', width: 1024, height: 1024, mimeType: 'image/png', sha256: 'def', assetReadiness: 'EXPERIMENT_ONLY', warnings: [] },
        })
        container = document.createElement('div')
        document.body.append(container)
        const root = createRoot(container)
        await act(async () => {
            root.render(createElement(SeedreamDiagnosticPanel, { creatureId: 'creature-1' }))
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(mocks.status).toHaveBeenCalledWith({ operation: 'GET_REQUEST_STATUS', transformationRequestId: '00000000-0000-4000-8000-000000000003' })
        expect(container.textContent).toContain('Risultato diagnostico')
        expect((container.querySelector('.seedream-diagnostic-panel__result > img') as HTMLImageElement).src).toBe('https://signed.example/seedream.png')
        await act(async () => root.unmount())
    })
})
