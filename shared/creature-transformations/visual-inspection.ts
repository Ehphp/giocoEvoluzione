import type { EvolutionTargetId } from './evolution-targets.ts'

export const VISUAL_INSPECTION_SCHEMA_VERSION = 'visual-inspection-v1'
export const OBSERVED_VISUAL_STATE_SCHEMA_VERSION = 'observed-visual-v1'

export const VISUAL_ANOMALY_TYPES = [
    'EXTRA_LIMB', 'MISSING_LIMB', 'DUPLICATED_LIMB', 'FUSED_LIMB', 'DEFORMED_APPENDAGE',
    'IMPOSSIBLE_ATTACHMENT', 'MIRRORED_SUBJECT', 'ORIENTATION_MISMATCH', 'OTHER_STRUCTURAL',
] as const
export type VisualAnomalyType = typeof VISUAL_ANOMALY_TYPES[number]

export const VISUAL_IMAGE_REGIONS = [
    'IMAGE_LEFT', 'IMAGE_RIGHT',
    'UPPER_IMAGE_LEFT', 'UPPER_IMAGE_CENTER', 'UPPER_IMAGE_RIGHT',
    'CENTER_IMAGE_LEFT', 'CENTER_IMAGE', 'CENTER_IMAGE_RIGHT',
    'LOWER_IMAGE_LEFT', 'LOWER_IMAGE_CENTER', 'LOWER_IMAGE_RIGHT',
] as const
export type VisualImageRegion = typeof VISUAL_IMAGE_REGIONS[number]

export type Vision1DiagnosticEvidence = Readonly<{
    type: VisualAnomalyType
    imageRegion: VisualImageRegion
    description: string
    confidence: number
}>

export type VisualAnomaly = Vision1DiagnosticEvidence & Readonly<{
    status: 'UNRESOLVED' | 'RESOLVED'
    detectedAtGeneration: number
    resolvedAtGeneration?: number
}>

export type MapperEvidenceAssessment = Readonly<{
    evidenceIndex: number
    disposition: 'CONFIRMED' | 'POSSIBLE' | 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE'
    verificationNote: string
}>

export type ObservedVisualState = Readonly<{
    schemaVersion: typeof OBSERVED_VISUAL_STATE_SCHEMA_VERSION
    orientation: Readonly<{
        viewpoint: 'FRONT' | 'THREE_QUARTER' | 'PROFILE' | 'REAR' | 'UNKNOWN'
        facing: 'IMAGE_LEFT' | 'IMAGE_RIGHT' | 'CENTER' | 'UNKNOWN'
    }>
    observedBodyPlan: string
    headAndEyes: string
    limbsAndLimbLikeStructures: string
    tail: string
    hornsAntlers: string
    dorsalStructures: string
    appendages: string
    skinCovering: string
    primaryColors: readonly string[]
    distinctiveStructures: readonly string[]
    targetRegions: readonly Readonly<{ target: EvolutionTargetId, description: string }>[]
}>

export type HorizontalMirrorAssetCorrection = Readonly<{
    type: 'HORIZONTAL_MIRROR'
    appliedAt: string
    /** Facing seen in the raw provider output before its pixels were mirrored. */
    outputFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT'
    /** Facing of the source image and of the corrected persisted asset. */
    sourceFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT'
}>

export type VisualInspection = Readonly<{
    schemaVersion: typeof VISUAL_INSPECTION_SCHEMA_VERSION
    inspectedAt: string
    anomalyDetector: Readonly<{
        status: 'COMPLETE' | 'UNAVAILABLE'
        evidence: readonly Vision1DiagnosticEvidence[]
    }>
    visualAnomalies: readonly VisualAnomaly[]
    stateMapper: Readonly<{
        status: 'COMPLETE' | 'UNAVAILABLE'
        usedVision1Evidence: boolean
        evidenceAssessments: readonly MapperEvidenceAssessment[]
        structuralConcerns: readonly Vision1DiagnosticEvidence[]
    }>
    observedVisualState?: ObservedVisualState
    assetCorrection?: HorizontalMirrorAssetCorrection
}>

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function text(value: unknown, maximum: number): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
}

function textList(value: unknown, maximumItems: number, maximumLength: number): string[] | null {
    if (!Array.isArray(value) || value.length > maximumItems) return null
    const parsed = value.map((entry) => text(entry, maximumLength))
    return parsed.every((entry): entry is string => entry !== null) ? parsed : null
}

function confidence(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function directionalFacing(value: unknown): 'IMAGE_LEFT' | 'IMAGE_RIGHT' | null {
    return value === 'IMAGE_LEFT' || value === 'IMAGE_RIGHT' ? value : null
}

function generation(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10_000 ? value : null
}

function anomalyType(value: unknown): VisualAnomalyType | null {
    return typeof value === 'string' && (VISUAL_ANOMALY_TYPES as readonly string[]).includes(value) ? value as VisualAnomalyType : null
}

function imageRegion(value: unknown): VisualImageRegion | null {
    return typeof value === 'string' && (VISUAL_IMAGE_REGIONS as readonly string[]).includes(value) ? value as VisualImageRegion : null
}

function target(value: unknown): EvolutionTargetId | null {
    return typeof value === 'string' && [
        'TAIL', 'LIMBS_AND_FEET', 'HEAD_AND_CROWN', 'BODY_SHAPE', 'DORSAL_STRUCTURES', 'SKIN_AND_COVERING', 'WINGS', 'TENTACLES',
    ].includes(value) ? value as EvolutionTargetId : null
}

export function parseVision1DiagnosticEvidence(value: unknown): Vision1DiagnosticEvidence | null {
    const item = record(value)
    if (!item || Object.keys(item).some((key) => !['type', 'imageRegion', 'description', 'confidence'].includes(key))) return null
    const type = anomalyType(item.type)
    const region = imageRegion(item.imageRegion)
    const description = text(item.description, 280)
    const parsedConfidence = confidence(item.confidence)
    return type && region && description && parsedConfidence !== null
        ? Object.freeze({ type, imageRegion: region, description, confidence: parsedConfidence })
        : null
}

function parseEvidenceList(value: unknown, maximum = 8): Vision1DiagnosticEvidence[] | null {
    if (!Array.isArray(value) || value.length > maximum) return null
    const parsed = value.map(parseVision1DiagnosticEvidence)
    return parsed.every((entry): entry is Vision1DiagnosticEvidence => entry !== null) ? parsed : null
}

export function parseMapperEvidenceAssessment(value: unknown): MapperEvidenceAssessment | null {
    const item = record(value)
    if (!item || Object.keys(item).some((key) => !['evidenceIndex', 'disposition', 'verificationNote'].includes(key))) return null
    const evidenceIndex = typeof item.evidenceIndex === 'number' && Number.isInteger(item.evidenceIndex) && item.evidenceIndex >= 0 && item.evidenceIndex < 8 ? item.evidenceIndex : null
    const disposition = item.disposition === 'CONFIRMED' || item.disposition === 'POSSIBLE' || item.disposition === 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE'
        ? item.disposition
        : null
    const verificationNote = text(item.verificationNote, 280)
    return evidenceIndex !== null && disposition && verificationNote
        ? Object.freeze({ evidenceIndex, disposition, verificationNote })
        : null
}

export function parseObservedVisualState(value: unknown): ObservedVisualState | null {
    const item = record(value)
    if (!item || Object.keys(item).some((key) => ![
        'schemaVersion', 'orientation', 'observedBodyPlan', 'headAndEyes', 'limbsAndLimbLikeStructures', 'tail', 'hornsAntlers', 'dorsalStructures', 'appendages',
        'skinCovering', 'primaryColors', 'distinctiveStructures', 'targetRegions',
    ].includes(key))) return null
    if (item.schemaVersion !== undefined && item.schemaVersion !== OBSERVED_VISUAL_STATE_SCHEMA_VERSION) return null
    const orientation = record(item.orientation)
    const viewpoint = orientation?.viewpoint === 'FRONT' || orientation?.viewpoint === 'THREE_QUARTER' || orientation?.viewpoint === 'PROFILE' || orientation?.viewpoint === 'REAR' || orientation?.viewpoint === 'UNKNOWN'
        ? orientation.viewpoint
        : null
    const facing = orientation?.facing === 'IMAGE_LEFT' || orientation?.facing === 'IMAGE_RIGHT' || orientation?.facing === 'CENTER' || orientation?.facing === 'UNKNOWN'
        ? orientation.facing
        : null
    const targetRegions = Array.isArray(item.targetRegions) && item.targetRegions.length <= 8
        ? item.targetRegions.map((entry) => {
            const region = record(entry)
            const regionTarget = target(region?.target)
            const description = text(region?.description, 240)
            return regionTarget && description ? Object.freeze({ target: regionTarget, description }) : null
        })
        : null
    const primaryColors = textList(item.primaryColors, 8, 80)
    const distinctiveStructures = textList(item.distinctiveStructures, 8, 160)
    const fields = [
        text(item.observedBodyPlan, 300), text(item.headAndEyes, 300), text(item.limbsAndLimbLikeStructures, 360), text(item.tail, 240),
        text(item.hornsAntlers, 240), text(item.dorsalStructures, 240), text(item.appendages, 300), text(item.skinCovering, 240),
    ]
    if (!viewpoint || !facing || !primaryColors || !distinctiveStructures || !targetRegions || !targetRegions.every((entry): entry is { target: EvolutionTargetId, description: string } => entry !== null) || fields.some((entry) => entry === null)) return null
    return Object.freeze({
        schemaVersion: OBSERVED_VISUAL_STATE_SCHEMA_VERSION,
        orientation: Object.freeze({ viewpoint, facing }),
        observedBodyPlan: fields[0]!, headAndEyes: fields[1]!, limbsAndLimbLikeStructures: fields[2]!, tail: fields[3]!, hornsAntlers: fields[4]!,
        dorsalStructures: fields[5]!, appendages: fields[6]!, skinCovering: fields[7]!, primaryColors: Object.freeze(primaryColors),
        distinctiveStructures: Object.freeze(distinctiveStructures), targetRegions: Object.freeze(targetRegions),
    })
}

function parseVisualAnomaly(value: unknown): VisualAnomaly | null {
    const item = record(value)
    if (!item || Object.keys(item).some((key) => !['type', 'imageRegion', 'description', 'confidence', 'status', 'detectedAtGeneration', 'resolvedAtGeneration'].includes(key))) return null
    const evidence = parseVision1DiagnosticEvidence({ type: item.type, imageRegion: item.imageRegion, description: item.description, confidence: item.confidence })
    const detectedAtGeneration = generation(item.detectedAtGeneration)
    const status = item.status === 'UNRESOLVED' || item.status === 'RESOLVED' ? item.status : null
    const resolvedAtGeneration = item.resolvedAtGeneration === undefined ? undefined : generation(item.resolvedAtGeneration)
    if (!evidence || !detectedAtGeneration || !status || (item.resolvedAtGeneration !== undefined && !resolvedAtGeneration) || (status === 'RESOLVED' && !resolvedAtGeneration)) return null
    return Object.freeze({ ...evidence, status, detectedAtGeneration, ...(resolvedAtGeneration ? { resolvedAtGeneration } : {}) })
}

function parseHorizontalMirrorAssetCorrection(value: unknown): HorizontalMirrorAssetCorrection | null {
    const item = record(value)
    if (!item || Object.keys(item).some((key) => !['type', 'appliedAt', 'outputFacing', 'sourceFacing'].includes(key))) return null
    const appliedAt = text(item.appliedAt, 64)
    const outputFacing = directionalFacing(item.outputFacing)
    const sourceFacing = directionalFacing(item.sourceFacing)
    return item.type === 'HORIZONTAL_MIRROR' && appliedAt && outputFacing && sourceFacing
        ? Object.freeze({ type: 'HORIZONTAL_MIRROR', appliedAt, outputFacing, sourceFacing })
        : null
}

export function parseVisualInspection(value: unknown): VisualInspection | null {
    const item = record(value)
    if (!item || item.schemaVersion !== VISUAL_INSPECTION_SCHEMA_VERSION || Object.keys(item).some((key) => !['schemaVersion', 'inspectedAt', 'anomalyDetector', 'visualAnomalies', 'stateMapper', 'observedVisualState', 'assetCorrection'].includes(key))) return null
    const inspectedAt = text(item.inspectedAt, 64)
    const detector = record(item.anomalyDetector)
    const mapper = record(item.stateMapper)
    const evidence = parseEvidenceList(detector?.evidence)
    const anomalies = Array.isArray(item.visualAnomalies) && item.visualAnomalies.length <= 16 ? item.visualAnomalies.map(parseVisualAnomaly) : null
    const assessments = Array.isArray(mapper?.evidenceAssessments) && mapper.evidenceAssessments.length <= 8 ? mapper.evidenceAssessments.map(parseMapperEvidenceAssessment) : null
    const structuralConcerns = parseEvidenceList(mapper?.structuralConcerns)
    const observed = item.observedVisualState === undefined ? undefined : parseObservedVisualState(item.observedVisualState)
    const assetCorrection = item.assetCorrection === undefined ? undefined : parseHorizontalMirrorAssetCorrection(item.assetCorrection)
    if (!inspectedAt || (detector?.status !== 'COMPLETE' && detector?.status !== 'UNAVAILABLE') || !evidence || !anomalies || !anomalies.every((entry): entry is VisualAnomaly => entry !== null)
        || (mapper?.status !== 'COMPLETE' && mapper?.status !== 'UNAVAILABLE') || typeof mapper?.usedVision1Evidence !== 'boolean' || !assessments || !assessments.every((entry): entry is MapperEvidenceAssessment => entry !== null)
        || !structuralConcerns || (item.observedVisualState !== undefined && !observed) || (item.assetCorrection !== undefined && !assetCorrection)) return null
    return Object.freeze({
        schemaVersion: VISUAL_INSPECTION_SCHEMA_VERSION, inspectedAt,
        anomalyDetector: Object.freeze({ status: detector.status, evidence: Object.freeze(evidence) }),
        visualAnomalies: Object.freeze(anomalies),
        stateMapper: Object.freeze({ status: mapper.status, usedVision1Evidence: mapper.usedVision1Evidence, evidenceAssessments: Object.freeze(assessments), structuralConcerns: Object.freeze(structuralConcerns) }),
        ...(observed ? { observedVisualState: observed } : {}),
        ...(assetCorrection ? { assetCorrection } : {}),
    })
}

export type HorizontalMirrorCorrectionDecision = Readonly<{
    action: 'FLIP' | 'KEEP'
    reason: 'SOURCE_FACING_UNKNOWN' | 'OUTPUT_FACING_UNKNOWN' | 'FACING_ALREADY_MATCHES' | 'MIRROR_NOT_CONFIRMED' | 'ALREADY_CORRECTED' | 'CONFIRMED_OPPOSITE_FACING'
    sourceFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT' | null
    outputFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT' | null
}>

/**
 * The visual detector's MIRRORED_SUBJECT finding is the semantic signal. Facing is an
 * independent guard: a horizontal flip is safe only when the source and raw output are known
 * opposites and Vision 2 confirms the exact Vision 1 mirror finding.
 */
export function decideHorizontalMirrorCorrection(input: {
    sourceFacing: ObservedVisualState['orientation']['facing'] | null | undefined
    inspection: VisualInspection
}): HorizontalMirrorCorrectionDecision {
    const sourceFacing = directionalFacing(input.sourceFacing)
    const outputFacing = directionalFacing(input.inspection.observedVisualState?.orientation.facing)
    if (input.inspection.assetCorrection?.type === 'HORIZONTAL_MIRROR') return Object.freeze({ action: 'KEEP', reason: 'ALREADY_CORRECTED', sourceFacing, outputFacing })
    if (!sourceFacing) return Object.freeze({ action: 'KEEP', reason: 'SOURCE_FACING_UNKNOWN', sourceFacing, outputFacing })
    if (!outputFacing) return Object.freeze({ action: 'KEEP', reason: 'OUTPUT_FACING_UNKNOWN', sourceFacing, outputFacing })
    if (sourceFacing === outputFacing) return Object.freeze({ action: 'KEEP', reason: 'FACING_ALREADY_MATCHES', sourceFacing, outputFacing })
    const hasConfirmedMirror = input.inspection.anomalyDetector.status === 'COMPLETE'
        && input.inspection.stateMapper.status === 'COMPLETE'
        && input.inspection.anomalyDetector.evidence.some((evidence, evidenceIndex) => evidence.type === 'MIRRORED_SUBJECT'
            && evidence.confidence >= 0.8
            && input.inspection.stateMapper.evidenceAssessments.some((assessment) => assessment.evidenceIndex === evidenceIndex && assessment.disposition === 'CONFIRMED'))
    return hasConfirmedMirror
        ? Object.freeze({ action: 'FLIP', reason: 'CONFIRMED_OPPOSITE_FACING', sourceFacing, outputFacing })
        : Object.freeze({ action: 'KEEP', reason: 'MIRROR_NOT_CONFIRMED', sourceFacing, outputFacing })
}

function mirrorImageRegion(region: VisualImageRegion): VisualImageRegion {
    const regions: Record<VisualImageRegion, VisualImageRegion> = {
        IMAGE_LEFT: 'IMAGE_RIGHT', IMAGE_RIGHT: 'IMAGE_LEFT',
        UPPER_IMAGE_LEFT: 'UPPER_IMAGE_RIGHT', UPPER_IMAGE_CENTER: 'UPPER_IMAGE_CENTER', UPPER_IMAGE_RIGHT: 'UPPER_IMAGE_LEFT',
        CENTER_IMAGE_LEFT: 'CENTER_IMAGE_RIGHT', CENTER_IMAGE: 'CENTER_IMAGE', CENTER_IMAGE_RIGHT: 'CENTER_IMAGE_LEFT',
        LOWER_IMAGE_LEFT: 'LOWER_IMAGE_RIGHT', LOWER_IMAGE_CENTER: 'LOWER_IMAGE_CENTER', LOWER_IMAGE_RIGHT: 'LOWER_IMAGE_LEFT',
    }
    return regions[region]
}

function mirrorEvidenceRegion<T extends Vision1DiagnosticEvidence>(evidence: T): T {
    return Object.freeze({ ...evidence, imageRegion: mirrorImageRegion(evidence.imageRegion) }) as T
}

/**
 * Records the raw-orientation evidence while making the persisted inspection describe the
 * corrected asset. This keeps future visual-continuity prompts aligned with the actual source.
 */
export function applyHorizontalMirrorCorrection(input: {
    inspection: VisualInspection
    sourceFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT'
    outputFacing: 'IMAGE_LEFT' | 'IMAGE_RIGHT'
    generation: number
    appliedAt: string
}): VisualInspection {
    const observed = input.inspection.observedVisualState
    if (!observed) throw new Error('L ispezione non contiene un orientamento da correggere.')
    return Object.freeze({
        ...input.inspection,
        anomalyDetector: Object.freeze({
            ...input.inspection.anomalyDetector,
            evidence: Object.freeze(input.inspection.anomalyDetector.evidence.map(mirrorEvidenceRegion)),
        }),
        visualAnomalies: Object.freeze(input.inspection.visualAnomalies.map((anomaly) => Object.freeze({
            ...mirrorEvidenceRegion(anomaly),
            ...(anomaly.type === 'MIRRORED_SUBJECT' ? { status: 'RESOLVED' as const, resolvedAtGeneration: input.generation } : {}),
        }))),
        stateMapper: Object.freeze({
            ...input.inspection.stateMapper,
            structuralConcerns: Object.freeze(input.inspection.stateMapper.structuralConcerns.map(mirrorEvidenceRegion)),
        }),
        observedVisualState: Object.freeze({
            ...observed,
            orientation: Object.freeze({ ...observed.orientation, facing: input.sourceFacing }),
        }),
        assetCorrection: Object.freeze({ type: 'HORIZONTAL_MIRROR', appliedAt: input.appliedAt, outputFacing: input.outputFacing, sourceFacing: input.sourceFacing }),
    })
}

function sameAnomaly(left: Pick<Vision1DiagnosticEvidence, 'type' | 'imageRegion'>, right: Pick<Vision1DiagnosticEvidence, 'type' | 'imageRegion'>): boolean {
    return left.type === right.type && left.imageRegion === right.imageRegion
}

function concernMatches(anomaly: VisualAnomaly, concerns: readonly Vision1DiagnosticEvidence[]): boolean {
    return concerns.some((concern) => sameAnomaly(anomaly, concern))
}

/**
 * Vision 1 remains the primary detector. A prior debt is resolved only if Vision 1 no longer
 * detects it and the successful mapper independently reports no compatible structural concern.
 */
export function mergeVisualInspection(input: {
    previous: VisualInspection | null | undefined
    generation: number
    inspectedAt: string
    detector: Readonly<{ status: 'COMPLETE' | 'UNAVAILABLE', evidence: readonly Vision1DiagnosticEvidence[] }>
    mapper: Readonly<{
        status: 'COMPLETE' | 'UNAVAILABLE'
        usedVision1Evidence: boolean
        evidenceAssessments: readonly MapperEvidenceAssessment[]
        structuralConcerns: readonly Vision1DiagnosticEvidence[]
        observedVisualState?: ObservedVisualState
    }>
}): VisualInspection {
    const previous = input.previous ?? null
    if (input.detector.status === 'UNAVAILABLE') {
        return Object.freeze({
            schemaVersion: VISUAL_INSPECTION_SCHEMA_VERSION, inspectedAt: input.inspectedAt,
            anomalyDetector: Object.freeze({ status: 'UNAVAILABLE', evidence: Object.freeze([]) }),
            visualAnomalies: Object.freeze([...(previous?.visualAnomalies ?? [])]),
            stateMapper: Object.freeze({ status: input.mapper.status, usedVision1Evidence: false, evidenceAssessments: Object.freeze([...input.mapper.evidenceAssessments]), structuralConcerns: Object.freeze([...input.mapper.structuralConcerns]) }),
            ...(input.mapper.observedVisualState ? { observedVisualState: input.mapper.observedVisualState } : {}),
        })
    }

    const priorUnresolved = (previous?.visualAnomalies ?? []).filter((anomaly) => anomaly.status === 'UNRESOLVED')
    const continuedOrNew = input.detector.evidence.map((evidence) => {
        const previousAnomaly = priorUnresolved.find((anomaly) => sameAnomaly(anomaly, evidence))
        return Object.freeze({
            ...evidence,
            status: 'UNRESOLVED' as const,
            detectedAtGeneration: previousAnomaly?.detectedAtGeneration ?? input.generation,
        })
    })
    const absentFromDetector = priorUnresolved.filter((anomaly) => !input.detector.evidence.some((evidence) => sameAnomaly(anomaly, evidence)))
    const retained = input.mapper.status !== 'COMPLETE'
        ? absentFromDetector
        : absentFromDetector.filter((anomaly) => concernMatches(anomaly, input.mapper.structuralConcerns))
    const resolved = input.mapper.status === 'COMPLETE'
        ? absentFromDetector.filter((anomaly) => !concernMatches(anomaly, input.mapper.structuralConcerns)).map((anomaly) => Object.freeze({ ...anomaly, status: 'RESOLVED' as const, resolvedAtGeneration: input.generation }))
        : []
    return Object.freeze({
        schemaVersion: VISUAL_INSPECTION_SCHEMA_VERSION, inspectedAt: input.inspectedAt,
        anomalyDetector: Object.freeze({ status: 'COMPLETE', evidence: Object.freeze([...input.detector.evidence]) }),
        visualAnomalies: Object.freeze([...continuedOrNew, ...retained, ...resolved]),
        stateMapper: Object.freeze({ status: input.mapper.status, usedVision1Evidence: input.mapper.usedVision1Evidence, evidenceAssessments: Object.freeze([...input.mapper.evidenceAssessments]), structuralConcerns: Object.freeze([...input.mapper.structuralConcerns]) }),
        ...(input.mapper.observedVisualState ? { observedVisualState: input.mapper.observedVisualState } : {}),
    })
}

function hasRejectedAssessment(inspection: VisualInspection, anomaly: VisualAnomaly): boolean {
    const index = inspection.anomalyDetector.evidence.findIndex((evidence) => sameAnomaly(anomaly, evidence))
    return index >= 0 && inspection.stateMapper.evidenceAssessments.some((assessment) => assessment.evidenceIndex === index && assessment.disposition === 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE')
}

export function visualRepairBrief(inspection: VisualInspection | null | undefined): string | null {
    if (!inspection) return null
    const anomalies = inspection.visualAnomalies
        .filter((anomaly) => anomaly.status === 'UNRESOLVED' && anomaly.confidence >= 0.7 && !hasRejectedAssessment(inspection, anomaly))
        .slice(0, 2)
    if (!anomalies.length) return null
    return [
        'VISUAL REPAIR CONTINUITY (secondary to the selected evolution target)',
        ...anomalies.map((anomaly) => `- ${anomaly.type} at ${anomaly.imageRegion}: ${anomaly.description}`),
        'Restore these defects naturally while keeping the selected mutation as the primary visible change. Do not treat a defect as a new evolutionary feature.',
    ].join('\n')
}

export function visualContinuityBrief(inspection: VisualInspection | null | undefined): string | null {
    if (!inspection) return null
    const sections: string[] = []
    if (inspection.observedVisualState) {
        const observed = inspection.observedVisualState
        sections.push(`CURRENT OBSERVED VISUAL STATE (descriptive, never canonical): orientation ${observed.orientation.viewpoint}/${observed.orientation.facing}; body plan ${observed.observedBodyPlan}; limbs ${observed.limbsAndLimbLikeStructures}; tail ${observed.tail}; covering ${observed.skinCovering}.`)
    }
    const repair = visualRepairBrief(inspection)
    if (repair) sections.push(repair)
    return sections.length ? sections.join('\n') : null
}
