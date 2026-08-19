import { describe, expect, it, vi } from 'vitest'
import { BODY_PLANS } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { GeminiVisualInspectionService, readGeminiVisualInspectionConfiguration, type GeminiVisualInspectionConfiguration } from './gemini-visual-inspection-service.ts'

const configuration: GeminiVisualInspectionConfiguration = Object.freeze({ enabled: true, apiKey: 'test-key', model: 'gemini-3.1-flash-lite', detectorTimeoutMs: 100, mapperTimeoutMs: 100 })
const detectorEvidence = { type: 'EXTRA_LIMB', imageRegion: 'CENTER_IMAGE_RIGHT', confidence: 0.93, description: 'Additional limb-like structure detected.' }
const observed = {
    shortDescription: 'Una minuta creatura quadrupede dalle scaglie verde giada, con un quinto arto laterale, coda piumata e corna ricurve d\'ambra.',
    orientation: { viewpoint: 'PROFILE', facing: 'IMAGE_RIGHT' }, observedBodyPlan: 'quadruped', headAndEyes: 'one head',
    limbsAndLimbLikeStructures: 'four limbs plus a possible extra limb', tail: 'one tail', hornsAntlers: 'none', dorsalStructures: 'none',
    appendages: 'possible extra limb', skinCovering: 'scales', primaryColors: ['green'], distinctiveStructures: [], targetRegions: [],
}
const INVALID_JSON = Symbol('invalid-json')

function generated(value: unknown): Response {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 })
}

function generatedText(text: string): Response {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
}

function fetchFor(input: { detector: unknown, mapper: unknown, onMapper?: (body: Record<string, unknown>) => void }) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url)
        if (href.endsWith('/upload/v1beta/files')) return new Response('', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example.test/session' } })
        if (href === 'https://upload.example.test/session') return new Response(JSON.stringify({ file: { name: 'files/one', uri: 'gemini://files/one', mimeType: 'image/png' } }), { status: 200 })
        if (href.includes(':generateContent')) {
            const body = JSON.parse(String(init?.body)) as Record<string, unknown>
            const prompt = String(((body.contents as Array<{ parts: Array<{ text?: string }> }>)[0].parts[0].text))
            if (prompt.includes('specialized visual anomaly detector')) return input.detector === INVALID_JSON ? generatedText('{not valid json') : generated(input.detector)
            input.onMapper?.(body)
            return generated(input.mapper)
        }
        if (init?.method === 'DELETE') return new Response('', { status: 200 })
        throw new Error(`Unexpected Gemini request: ${href}`)
    }) as unknown as typeof fetch
}

describe('GeminiVisualInspectionService', () => {
    it('uses configurable Vision timeouts with conservative defaults', () => {
        expect(readGeminiVisualInspectionConfiguration((name) => ({ GEMINI_API_KEY: 'key' }[name])).detectorTimeoutMs).toBe(4_000)
        expect(readGeminiVisualInspectionConfiguration((name) => ({ GEMINI_API_KEY: 'key', CREATURE_VISION_1_TIMEOUT_MS: '5000', CREATURE_VISION_2_TIMEOUT_MS: '7000' }[name])).mapperTimeoutMs).toBe(7_000)
    })

    it('runs Vision 1 before Vision 2 and injects its structured diagnostic evidence into the mapper prompt', async () => {
        let mapperBody: Record<string, unknown> | undefined
        const service = new GeminiVisualInspectionService(configuration, fetchFor({
            detector: { evidence: [detectorEvidence] },
            mapper: { observedVisualState: observed, evidenceAssessments: [{ evidenceIndex: 0, disposition: 'CONFIRMED', verificationNote: 'visible' }], structuralConcerns: [detectorEvidence] },
            onMapper: (body) => { mapperBody = body },
        }))
        const result = await service.inspect({ image: new Uint8Array([1, 2, 3]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null, now: () => '2026-08-17T00:00:00.000Z' })
        expect(result.anomalyDetector.evidence).toEqual([detectorEvidence])
        expect(result.stateMapper.usedVision1Evidence).toBe(true)
        expect(result.observedVisualState?.shortDescription).toBe(observed.shortDescription)
        const mapperPrompt = String((((mapperBody!.contents as Array<{ parts: Array<{ text?: string }> }>)[0].parts[0]).text))
        expect(mapperPrompt).toContain('"type":"EXTRA_LIMB"')
        expect(mapperPrompt).toContain('"imageRegion":"CENTER_IMAGE_RIGHT"')
        expect(mapperPrompt).toContain('Do not silently discard upstream evidence')
        expect(mapperPrompt).toContain('shortDescription in Italian')
        expect(mapperPrompt).toContain('compact visual signature')
        expect(mapperPrompt).toContain('never say "occhi espressivi"')
    })

    it('continues with image-only Vision 2 when Vision 1 returns invalid JSON', async () => {
        let mapperBody: Record<string, unknown> | undefined
        const service = new GeminiVisualInspectionService(configuration, fetchFor({
            detector: INVALID_JSON,
            mapper: { observedVisualState: observed, evidenceAssessments: [], structuralConcerns: [] },
            onMapper: (body) => { mapperBody = body },
        }))
        const result = await service.inspect({ image: new Uint8Array([1]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null })
        expect(result.anomalyDetector.status).toBe('UNAVAILABLE')
        expect(result.stateMapper.status).toBe('COMPLETE')
        expect(String((((mapperBody!.contents as Array<{ parts: Array<{ text?: string }> }>)[0].parts[0]).text))).toContain('\n[]\n')
    })

    it('persists Vision 1 evidence as unresolved when Vision 2 is unavailable', async () => {
        const service = new GeminiVisualInspectionService(configuration, fetchFor({
            detector: { evidence: [detectorEvidence] },
            mapper: { unexpected: true },
        }))
        const result = await service.inspect({ image: new Uint8Array([1]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null })
        expect(result.anomalyDetector.status).toBe('COMPLETE')
        expect(result.stateMapper.status).toBe('UNAVAILABLE')
        expect(result.visualAnomalies).toEqual([expect.objectContaining({ type: 'EXTRA_LIMB', status: 'UNRESOLVED' })])
    })

    it('persists mapper POSSIBLE and strong-contrary-evidence assessments without letting them alter canonical anatomy', async () => {
        const service = new GeminiVisualInspectionService(configuration, fetchFor({
            detector: { evidence: [detectorEvidence] },
            mapper: { observedVisualState: observed, evidenceAssessments: [{ evidenceIndex: 0, disposition: 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE', verificationNote: 'clear contrary geometry' }], structuralConcerns: [] },
        }))
        const result = await service.inspect({ image: new Uint8Array([1]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null })
        expect(result.stateMapper.evidenceAssessments).toEqual([expect.objectContaining({ disposition: 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE' })])
        expect(result.visualAnomalies).toEqual([expect.objectContaining({ status: 'UNRESOLVED' })])
    })

    it('fails open when both Vision calls are unavailable', async () => {
        const service = new GeminiVisualInspectionService(configuration, fetchFor({ detector: { unexpected: true }, mapper: { unexpected: true } }))
        await expect(service.inspect({ image: new Uint8Array([1]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null })).resolves.toMatchObject({
            anomalyDetector: { status: 'UNAVAILABLE' }, stateMapper: { status: 'UNAVAILABLE' }, visualAnomalies: [],
        })
    })

    it('treats a Vision 1 timeout as unavailable and still runs Vision 2', async () => {
        const timedConfiguration = { ...configuration, detectorTimeoutMs: 1 }
        const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const href = String(url)
            if (href.endsWith('/upload/v1beta/files')) return new Response('', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example.test/session' } })
            if (href === 'https://upload.example.test/session') return new Response(JSON.stringify({ file: { name: 'files/one', uri: 'gemini://files/one', mimeType: 'image/png' } }), { status: 200 })
            if (href.includes(':generateContent') && String(init?.body).includes('specialized visual anomaly detector')) {
                return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
            }
            if (href.includes(':generateContent')) return generated({ observedVisualState: observed, evidenceAssessments: [], structuralConcerns: [] })
            return new Response('', { status: 200 })
        }) as unknown as typeof fetch
        const result = await new GeminiVisualInspectionService(timedConfiguration, fetch).inspect({ image: new Uint8Array([1]), mimeType: 'image/png', bodyPlan: BODY_PLANS.QUADRUPED, generation: 2, previous: null })
        expect(result.anomalyDetector.status).toBe('UNAVAILABLE')
        expect(result.stateMapper.status).toBe('COMPLETE')
    })
})
