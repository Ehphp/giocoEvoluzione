import { resolveCreatureHeightMeters } from '../creature-scale.ts'

export const RELATIVE_HEIGHT_COMPARISON_SCHEMA_VERSION = 'relative-height-v1'
export const RELATIVE_HEIGHT_CONFIDENCE_THRESHOLD = 0.65
export const MIN_CREATURE_HEIGHT_METERS = 0.45
export const MAX_CREATURE_HEIGHT_METERS = 4.5

export const RELATIVE_HEIGHT_CHANGES = [
    'MUCH_SHORTER',
    'SHORTER',
    'UNCHANGED',
    'TALLER',
    'MUCH_TALLER',
] as const
export type RelativeHeightChange = (typeof RELATIVE_HEIGHT_CHANGES)[number]

export const RELATIVE_HEIGHT_CONFOUNDERS = [
    'POSE_CHANGED',
    'VIEWPOINT_CHANGED',
    'FRAMING_CHANGED',
    'FEET_NOT_VISIBLE',
    'HEAD_NOT_VISIBLE',
    'LARGE_APPENDAGES',
] as const
export type RelativeHeightConfounder = (typeof RELATIVE_HEIGHT_CONFOUNDERS)[number]

export type RelativeHeightAssessment = Readonly<{
    status: 'COMPLETE' | 'AMBIGUOUS' | 'UNAVAILABLE'
    change: RelativeHeightChange
    confidence: number
    confounders: readonly RelativeHeightConfounder[]
    shortReason: string
}>

/**
 * The compact, accepted evidence that moves with a visual version.  The absolute result is
 * deliberately stored so adoption retries never multiply a height twice.
 */
export type RelativeHeightComparison = Readonly<{
    schemaVersion: typeof RELATIVE_HEIGHT_COMPARISON_SCHEMA_VERSION
    sourceVersionId: string
    sourceHeightMeters: number
    resultHeightMeters: number
    change: RelativeHeightChange
    confidence: number
    confounders: readonly RelativeHeightConfounder[]
}>

const HEIGHT_CHANGE_MULTIPLIERS: Readonly<Record<RelativeHeightChange, number>> = Object.freeze({
    MUCH_SHORTER: 0.85,
    SHORTER: 0.93,
    UNCHANGED: 1,
    TALLER: 1.08,
    MUCH_TALLER: 1.18,
})

const UNUSABLE_CONFOUNDERS: readonly RelativeHeightConfounder[] = Object.freeze([
    'POSE_CHANGED',
    'VIEWPOINT_CHANGED',
    'FRAMING_CHANGED',
    'FEET_NOT_VISIBLE',
    'HEAD_NOT_VISIBLE',
])

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function positiveNumber(value: unknown): value is number {
    return finiteNumber(value) && value > 0
}

function confidence(value: unknown): number | null {
    return finiteNumber(value) && value >= 0 && value <= 1 ? value : null
}

function shortText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 220 ? value.trim() : null
}

function sourceVersionId(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Za-z0-9:-]{1,128}$/.test(value) ? value : null
}

function change(value: unknown): RelativeHeightChange | null {
    return typeof value === 'string' && (RELATIVE_HEIGHT_CHANGES as readonly string[]).includes(value)
        ? (value as RelativeHeightChange)
        : null
}

function confounders(value: unknown): RelativeHeightConfounder[] | null {
    if (!Array.isArray(value) || value.length > RELATIVE_HEIGHT_CONFOUNDERS.length) return null
    const parsed = value.map((entry) =>
        typeof entry === 'string' && (RELATIVE_HEIGHT_CONFOUNDERS as readonly string[]).includes(entry)
            ? (entry as RelativeHeightConfounder)
            : null,
    )
    return parsed.every((entry): entry is RelativeHeightConfounder => entry !== null) &&
        new Set(parsed).size === parsed.length
        ? parsed
        : null
}

export function clampCreatureHeightMeters(heightMeters: number): number {
    return Math.min(MAX_CREATURE_HEIGHT_METERS, Math.max(MIN_CREATURE_HEIGHT_METERS, heightMeters))
}

export function getRelativeHeightMultiplier(change: RelativeHeightChange): number {
    return HEIGHT_CHANGE_MULTIPLIERS[change]
}

export function parseRelativeHeightAssessment(value: unknown): RelativeHeightAssessment | null {
    const item = record(value)
    if (
        !item ||
        Object.keys(item).some((key) => !['status', 'change', 'confidence', 'confounders', 'shortReason'].includes(key))
    )
        return null

    const parsedChange = change(item.change)
    const parsedConfidence = confidence(item.confidence)
    const parsedConfounders = confounders(item.confounders)
    const parsedReason = shortText(item.shortReason)
    return (
        (item.status === 'COMPLETE' || item.status === 'AMBIGUOUS' || item.status === 'UNAVAILABLE') &&
        parsedChange &&
        parsedConfidence !== null &&
        parsedConfounders &&
        parsedReason
    )
        ? Object.freeze({
              status: item.status,
              change: parsedChange,
              confidence: parsedConfidence,
              confounders: Object.freeze(parsedConfounders),
              shortReason: parsedReason,
          })
        : null
}

export function isRelativeHeightAssessmentUsable(assessment: RelativeHeightAssessment): boolean {
    return (
        assessment.status === 'COMPLETE' &&
        assessment.confidence >= RELATIVE_HEIGHT_CONFIDENCE_THRESHOLD &&
        !assessment.confounders.some((confounder) => UNUSABLE_CONFOUNDERS.includes(confounder))
    )
}

/** Returns the immutable result when the evidence is usable, otherwise the canonical source value. */
export function resolveRelativeHeightResult(input: {
    sourceHeightMeters: unknown
    assessment: RelativeHeightAssessment | null | undefined
}): number {
    const sourceHeightMeters = resolveCreatureHeightMeters(input.sourceHeightMeters)
    if (!input.assessment || !isRelativeHeightAssessmentUsable(input.assessment)) return sourceHeightMeters

    return clampCreatureHeightMeters(sourceHeightMeters * getRelativeHeightMultiplier(input.assessment.change))
}

export function createRelativeHeightComparison(input: {
    sourceVersionId: unknown
    sourceHeightMeters: unknown
    assessment: RelativeHeightAssessment | null | undefined
}): RelativeHeightComparison | null {
    const parsedSourceVersionId = sourceVersionId(input.sourceVersionId)
    const sourceHeightMeters = resolveCreatureHeightMeters(input.sourceHeightMeters)
    const assessment = input.assessment
    if (!parsedSourceVersionId || !assessment || !isRelativeHeightAssessmentUsable(assessment)) return null

    return Object.freeze({
        schemaVersion: RELATIVE_HEIGHT_COMPARISON_SCHEMA_VERSION,
        sourceVersionId: parsedSourceVersionId,
        sourceHeightMeters,
        resultHeightMeters: resolveRelativeHeightResult({ sourceHeightMeters, assessment }),
        change: assessment.change,
        confidence: assessment.confidence,
        confounders: Object.freeze([...assessment.confounders]),
    })
}

export function parseRelativeHeightComparison(value: unknown): RelativeHeightComparison | null {
    const item = record(value)
    if (
        !item ||
        Object.keys(item).some(
            (key) =>
                ![
                    'schemaVersion',
                    'sourceVersionId',
                    'sourceHeightMeters',
                    'resultHeightMeters',
                    'change',
                    'confidence',
                    'confounders',
                ].includes(key),
        )
    )
        return null

    const parsedSourceVersionId = sourceVersionId(item.sourceVersionId)
    const parsedChange = change(item.change)
    const parsedConfidence = confidence(item.confidence)
    const parsedConfounders = confounders(item.confounders)
    if (
        item.schemaVersion !== RELATIVE_HEIGHT_COMPARISON_SCHEMA_VERSION ||
        !parsedSourceVersionId ||
        !positiveNumber(item.sourceHeightMeters) ||
        !finiteNumber(item.resultHeightMeters) ||
        !parsedChange ||
        parsedConfidence === null ||
        !parsedConfounders
    )
        return null

    const assessment: RelativeHeightAssessment = Object.freeze({
        status: 'COMPLETE',
        change: parsedChange,
        confidence: parsedConfidence,
        confounders: Object.freeze(parsedConfounders),
        shortReason: 'Persisted accepted assessment.',
    })
    if (!isRelativeHeightAssessmentUsable(assessment)) return null
    const expectedResult = resolveRelativeHeightResult({
        sourceHeightMeters: item.sourceHeightMeters,
        assessment,
    })
    if (Math.abs(expectedResult - item.resultHeightMeters) > Number.EPSILON) return null

    return Object.freeze({
        schemaVersion: RELATIVE_HEIGHT_COMPARISON_SCHEMA_VERSION,
        sourceVersionId: parsedSourceVersionId,
        sourceHeightMeters: item.sourceHeightMeters,
        resultHeightMeters: item.resultHeightMeters,
        change: parsedChange,
        confidence: parsedConfidence,
        confounders: Object.freeze(parsedConfounders),
    })
}
