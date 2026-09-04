export const PROPORTION_FINDING_REGIONS = ['HEAD', 'NECK', 'TRUNK', 'LIMBS'] as const
export type ProportionFindingRegion = (typeof PROPORTION_FINDING_REGIONS)[number]

export const PROPORTION_FINDING_CHANGES = ['INTRODUCED', 'WORSENED', 'PREEXISTING', 'IMPROVED'] as const
export type ProportionFindingChange = (typeof PROPORTION_FINDING_CHANGES)[number]

export const PROPORTION_FINDING_AUTHORIZATIONS = [
    'AUTHORIZED',
    'UNAUTHORIZED',
    'NOT_APPLICABLE',
    'AMBIGUOUS',
] as const
export type ProportionFindingAuthorization = (typeof PROPORTION_FINDING_AUTHORIZATIONS)[number]

/** A bounded source/result assessment. It is descriptive metadata until lifecycle policy consumes it. */
export type ProportionFinding = Readonly<{
    region: ProportionFindingRegion
    change: ProportionFindingChange
    authorization: ProportionFindingAuthorization
    confidence: number
    reason: string
}>

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 280
        ? value.trim()
        : null
}

function confidence(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

export function parseProportionFindingRegion(value: unknown): ProportionFindingRegion | null {
    return typeof value === 'string' && (PROPORTION_FINDING_REGIONS as readonly string[]).includes(value)
        ? (value as ProportionFindingRegion)
        : null
}

function change(value: unknown): ProportionFindingChange | null {
    return typeof value === 'string' && (PROPORTION_FINDING_CHANGES as readonly string[]).includes(value)
        ? (value as ProportionFindingChange)
        : null
}

function authorization(value: unknown): ProportionFindingAuthorization | null {
    return typeof value === 'string' && (PROPORTION_FINDING_AUTHORIZATIONS as readonly string[]).includes(value)
        ? (value as ProportionFindingAuthorization)
        : null
}

export function parseProportionFinding(value: unknown): ProportionFinding | null {
    const item = record(value)
    if (
        !item ||
        Object.keys(item).some((key) => !['region', 'change', 'authorization', 'confidence', 'reason'].includes(key))
    )
        return null

    const parsedRegion = parseProportionFindingRegion(item.region)
    const parsedChange = change(item.change)
    const parsedAuthorization = authorization(item.authorization)
    const parsedConfidence = confidence(item.confidence)
    const reason = text(item.reason)

    return parsedRegion && parsedChange && parsedAuthorization && parsedConfidence !== null && reason
        ? Object.freeze({
              region: parsedRegion,
              change: parsedChange,
              authorization: parsedAuthorization,
              confidence: parsedConfidence,
              reason,
          })
        : null
}

/** Accepts at most one source/result finding for each mutable proportion region. */
export function parseProportionFindings(value: unknown): readonly ProportionFinding[] | null {
    if (!Array.isArray(value) || value.length > PROPORTION_FINDING_REGIONS.length) return null

    const findings = value.map(parseProportionFinding)
    if (!findings.every((finding): finding is ProportionFinding => finding !== null)) return null
    if (new Set(findings.map((finding) => finding.region)).size !== findings.length) return null

    return Object.freeze(findings)
}
