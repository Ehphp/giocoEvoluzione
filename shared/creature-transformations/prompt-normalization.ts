export function normalizePromptText(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
}

export function uniquePromptItems(values: readonly string[]): string[] {
    const seen = new Set<string>()
    const items: string[] = []

    for (const value of values) {
        const normalized = normalizePromptText(value)
        if (!normalized) continue

        const key = normalized.toLowerCase()
        if (seen.has(key)) continue

        seen.add(key)
        items.push(normalized)
    }

    return items
}

export function withTerminalPunctuation(value: string): string {
    const normalized = normalizePromptText(value)
    if (!normalized || /[.!?]$/.test(normalized)) return normalized
    return `${normalized}.`
}

function listItem(value: string): string {
    return normalizePromptText(value).replace(/[.!?]+$/, '')
}

export function formatPromptList(values: readonly string[]): string {
    const items = uniquePromptItems(values).map(listItem).filter(Boolean)
    if (!items.length) return ''
    if (items.length === 1) return items[0]
    if (items.length === 2) return `${items[0]} and ${items[1]}`
    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

