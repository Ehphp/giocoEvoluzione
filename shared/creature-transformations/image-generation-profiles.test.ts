import { describe, expect, it } from 'vitest'

import { getEnabledCreatureImageGenerationProfile, parseCreatureImageGenerationProfiles } from './image-generation-profiles.ts'

const valid = JSON.stringify({
    'openai-medium-v1': { provider: 'OPENAI', model: 'gpt-image-1.5', quality: 'medium', promptTemplateVersion: 'creature-transformation-v1', estimatedCostUsd: 0.25, enabled: true },
    'openai-disabled-v2': { provider: 'OPENAI', model: 'gpt-image-1.5', quality: 'high', promptTemplateVersion: 'creature-transformation-v2-experimental', estimatedCostUsd: 0, enabled: false },
})

describe('server-side image generation profiles', () => {
    it('parses only controlled profiles and fixes the render specification', () => {
        const profiles = parseCreatureImageGenerationProfiles(valid)
        expect(profiles.configurationError).toBeNull()
        expect(getEnabledCreatureImageGenerationProfile(profiles, 'openai-medium-v1')).toMatchObject({ width: 1024, height: 1536, quality: 'medium', estimatedCostUsd: 0.25 })
        expect(getEnabledCreatureImageGenerationProfile(profiles, 'openai-disabled-v2')).toBeNull()
    })

    it('fails closed for missing, malformed, unknown-field and unsafe enabled-cost configuration', () => {
        expect(parseCreatureImageGenerationProfiles(undefined).profiles.size).toBe(0)
        expect(parseCreatureImageGenerationProfiles('{').profiles.size).toBe(0)
        expect(parseCreatureImageGenerationProfiles(JSON.stringify({ bad: { provider: 'OPENAI', model: 'gpt-image-1.5', quality: 'medium', promptTemplateVersion: 'creature-transformation-v1', estimatedCostUsd: 1, enabled: true, endpoint: 'client-controlled' } })).profiles.size).toBe(0)
        expect(parseCreatureImageGenerationProfiles(JSON.stringify({ bad: { provider: 'OPENAI', model: 'gpt-image-1.5', quality: 'medium', promptTemplateVersion: 'creature-transformation-v1', estimatedCostUsd: 0, enabled: true } })).profiles.size).toBe(0)
    })
})
