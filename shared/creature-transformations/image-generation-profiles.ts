import {
    CREATURE_PROMPT_TEMPLATE_VERSION,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPRESSIVE,
    type CreaturePromptTemplateVersion,
} from './prompt-composer.ts'

export type CreatureImageGenerationProfile = Readonly<{
    id: string
    provider: 'OPENAI'
    model: string
    quality: 'low' | 'medium' | 'high'
    width: 1024
    height: 1536
    promptTemplateVersion: CreaturePromptTemplateVersion
    estimatedCostUsd: number
    enabled: boolean
}>

export type CreatureImageGenerationProfiles = Readonly<{
    profiles: ReadonlyMap<string, CreatureImageGenerationProfile>
    configurationError: string | null
}>

const PROFILE_FIELDS = new Set(['provider', 'model', 'quality', 'promptTemplateVersion', 'estimatedCostUsd', 'enabled'])
const PROMPT_TEMPLATE_VERSIONS = new Set<CreaturePromptTemplateVersion>([
    CREATURE_PROMPT_TEMPLATE_VERSION,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPRESSIVE,
])
const QUALITIES = new Set(['low', 'medium', 'high'])

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function profileError(message: string): CreatureImageGenerationProfiles {
    return Object.freeze({ profiles: new Map(), configurationError: message })
}

function validProfileId(value: string): boolean {
    return /^[a-z][a-z0-9-]{1,63}$/.test(value)
}

function parseProfile(id: string, value: unknown): CreatureImageGenerationProfile | null {
    const record = asRecord(value)
    if (!record || !validProfileId(id) || Object.keys(record).some((field) => !PROFILE_FIELDS.has(field))) return null
    const provider = record.provider
    const model = record.model
    const quality = record.quality
    const promptTemplateVersion = record.promptTemplateVersion
    const estimatedCostUsd = record.estimatedCostUsd
    const enabled = record.enabled
    if (provider !== 'OPENAI' || typeof model !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(model)) return null
    if (typeof quality !== 'string' || !QUALITIES.has(quality)) return null
    if (typeof promptTemplateVersion !== 'string' || !PROMPT_TEMPLATE_VERSIONS.has(promptTemplateVersion as CreaturePromptTemplateVersion)) return null
    if (typeof estimatedCostUsd !== 'number' || !Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0 || estimatedCostUsd > 1000) return null
    if (typeof enabled !== 'boolean' || (enabled && estimatedCostUsd <= 0)) return null
    return Object.freeze({
        id,
        provider,
        model,
        quality: quality as CreatureImageGenerationProfile['quality'],
        width: 1024,
        height: 1536,
        promptTemplateVersion: promptTemplateVersion as CreaturePromptTemplateVersion,
        estimatedCostUsd,
        enabled,
    })
}

export function parseCreatureImageGenerationProfiles(value: string | undefined): CreatureImageGenerationProfiles {
    if (!value?.trim()) return profileError('La configurazione dei generation profile non e presente.')
    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch {
        return profileError('La configurazione dei generation profile non e JSON valido.')
    }
    const root = asRecord(parsed)
    if (!root || !Object.keys(root).length || Object.keys(root).length > 20) return profileError('La configurazione dei generation profile non contiene un catalogo valido.')
    const profiles = new Map<string, CreatureImageGenerationProfile>()
    for (const [id, rawProfile] of Object.entries(root)) {
        const profile = parseProfile(id, rawProfile)
        if (!profile || profiles.has(id)) return profileError('Un generation profile non rispetta il contratto server-side.')
        profiles.set(id, profile)
    }
    return Object.freeze({ profiles, configurationError: null })
}

export function getEnabledCreatureImageGenerationProfile(
    profiles: CreatureImageGenerationProfiles,
    id: string,
): CreatureImageGenerationProfile | null {
    const profile = profiles.profiles.get(id)
    return profile?.enabled ? profile : null
}
