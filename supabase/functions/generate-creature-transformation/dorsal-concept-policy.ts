import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'

export type FluxMicroConceptSemanticViolationCode =
    | 'DORSAL_CRANIAL_OR_NECK_EXTENSION'
    | 'DORSAL_FORBIDDEN_MORPHOLOGY'
    | 'DORSAL_EXCESSIVE_SCALE'
    | 'DORSAL_PRESENTATION_LEAK'

export type FluxMicroConceptSemanticValidation = Readonly<{
    valid: boolean
    violations: readonly FluxMicroConceptSemanticViolationCode[]
}>

const DORSAL_CRANIAL_OR_NECK_EXTENSION_PATTERNS = [
    /\b(?:start(?:s|ed|ing)?|originat(?:es|ed|ing)?|emerge(?:s|d|ing)?|grow(?:s|n|ing)?|rise(?:s|n)?|extend(?:s|ed|ing)?)\b[^.!?\n]{0,72}\b(?:from|at|on|across|over|through)\s+(?:the\s+)?(?:skull|crown|forehead|head|cranial|neck|nape)\b/i,
    /\b(?:skull|crown|forehead|head|cranial|neck|nape)\b[^.!?\n]{0,72}\b(?:to|toward|into|along|down|across|through)\s+(?:the\s+)?(?:back|spine|tail)\b/i,
    /\b(?:back|spine)\b[^.!?\n]{0,72}\b(?:to|toward|into|along|up|across|through)\s+(?:the\s+)?(?:neck|nape|skull|crown|forehead|head)\b/i,
    /\b(?:dominant|primary)\b[^.!?\n]{0,48}\bneck\b|\bneck\b[^.!?\n]{0,48}\b(?:dominant|primary)\b/i,
    /\b(?:parte|partono|nasce|nascono|emerge|emergono|cresce|crescono|si\s+estende|si\s+estendono)\b[^.!?\n]{0,72}\b(?:dal|dalla|dallo|dai|sul|sulla|sullo)\s+(?:cranio|corona|fronte|testa|collo|nuca)\b/i,
    /\b(?:cranio|corona|fronte|testa|collo|nuca)\b[^.!?\n]{0,72}\b(?:alla|verso|lungo|fino\s+alla|attraverso)\s+(?:schiena|dorso|colonna|coda)\b/i,
    /\b(?:schiena|dorso|colonna)\b[^.!?\n]{0,72}\b(?:alla|verso|lungo|fino\s+alla|attraverso)\s+(?:collo|nuca|cranio|corona|fronte|testa)\b/i,
    /\b(?:dominante|primario)\b[^.!?\n]{0,48}\bcollo\b|\bcollo\b[^.!?\n]{0,48}\b(?:dominante|primario)\b/i,
]

const DORSAL_FORBIDDEN_MORPHOLOGY_PATTERNS = [
    /\b(?:dorsal\s+)?sails?\b/i,
    /\b(?:dorsal\s+)?fins?\b|\bfish[-\s]?like\b/i,
    /\b(?:fan[-\s]?(?:like|shaped)|fans?\s+out)\b/i,
    /\b(?:large|broad|wide|expansive)\s+(?:translucent\s+)?membranes?\b/i,
    /\bwing[-\s]?like\b|\b(?:wings?|wing\s+structures?)\s+(?:sprout|grow|emerge|extend)\b/i,
    /\b(?:independent(?:ly)?\s+(?:rooted\s+)?(?:dorsal\s+)?appendages?|separate\s+dorsal\s+appendages?)\b/i,
    /\bvel[ae]\b|\bpinne?\b|\bitti(?:co|ca|ci|che)\b/i,
    /\bventaglio\b|\b(?:ampia|ampio|larga|largo|estesa|esteso)\s+(?:membrana|membrane)\b/i,
    /\bali\b[^.!?\n]{0,48}\b(?:crescono|emergono|spuntano)\b|\bappendici\s+(?:dorsali\s+)?indipendenti\b/i,
]

const DORSAL_EXCESSIVE_SCALE_PATTERNS = [
    /\b(?:1(?:[.,]5)|one(?:\s+and\s+a)?\s+half)\s*(?:x|times?)\s+(?:the\s+)?(?:body|creature)(?:'?s)?(?:\s+(?:length|size|height))?\b/i,
    /\b(?:2x|twice|two\s+times)\s+(?:the\s+)?(?:body|creature)(?:'?s)?(?:\s+(?:length|size|height))?\b/i,
    /\b(?:towering|enormous|gigantic|colossal)\s+(?:dorsal\s+)?(?:spines?|ridges?|plates?|crests?|structures?)\b/i,
    /\b(?:dominates?|dwarfs?)\s+(?:the\s+)?(?:whole\s+)?(?:body|creature)\b/i,
    /\b(?:1(?:[.,]5)|una\s+volta\s+e\s+mezza)\s*(?:x|volte?)\s+(?:il\s+)?(?:corpo|creatura)\b/i,
    /\b(?:2x|due\s+volte)\s+(?:il\s+)?(?:corpo|creatura)\b/i,
    /\b(?:torreggianti|enormi|gigantesche|colossali)\s+(?:spine|creste|placche|strutture)\b/i,
    /\b(?:dominano|sovrastano)\s+(?:l[’']?intero\s+)?(?:corpo|creatura)\b/i,
]

const DORSAL_PRESENTATION_LEAK_PATTERNS = [
    /\b(?:rebalances?|rebalanced|rebalancing|redistributes?|redistributed|redistributing|reorients?|reoriented|reorienting|rotates?|rotated|repositions?|repositioned)\b[^.!?\n]{0,72}\b(?:posture|stance|pose|weight distribution|body presentation|orientation)\b/i,
    /\b(?:posture|stance|pose|weight distribution|body presentation|orientation)\b[^.!?\n]{0,72}\b(?:is rebalanced|becomes?|shifts?|adjusts?|changes?)\b/i,
    /\b(?:riequilibra|riequilibrata|riequilibrato|ribilancia|ribilanciata|redistribuisce|redistribuita|riorienta|riorientata|ruota|ruotata|riposiziona|riposizionata)\b[^.!?\n]{0,72}\b(?:postura|posa|assetto|distribuzione del peso|presentazione del corpo|orientamento)\b/i,
    /\b(?:postura|posa|assetto|distribuzione del peso|presentazione del corpo|orientamento)\b[^.!?\n]{0,72}\b(?:viene riequilibrata|diventa|si sposta|cambia)\b/i,
]

const RETRY_REASON_BY_VIOLATION: Readonly<Record<FluxMicroConceptSemanticViolationCode, string>> = {
    DORSAL_CRANIAL_OR_NECK_EXTENSION: 'cranial or neck locality',
    DORSAL_FORBIDDEN_MORPHOLOGY: 'forbidden dorsal morphology',
    DORSAL_EXCESSIVE_SCALE: 'body-dominating scale',
    DORSAL_PRESENTATION_LEAK: 'a pose or presentation change',
}

function constructiveConceptText(concept: FluxMicroConcept): string {
    return [concept.conceptName, concept.mutationIdea, ...concept.visualDetails].join('\n')
}

function matchesOne(patterns: readonly RegExp[], text: string): boolean {
    return patterns.some((pattern) => pattern.test(text))
}

/**
 * Applies the stricter DORSAL_STRUCTURES boundary to model-authored anatomy only.
 * The `avoid` list is intentionally excluded: it can name a forbidden shape while forbidding it.
 */
export function validateFluxMicroConceptTargetSemantics(
    concept: FluxMicroConcept,
    plan: FluxEvolutionPlan,
): FluxMicroConceptSemanticValidation {
    if (plan.evolutionTargetId !== 'DORSAL_STRUCTURES') return { valid: true, violations: [] }

    const text = constructiveConceptText(concept)
    const violations: FluxMicroConceptSemanticViolationCode[] = []
    if (matchesOne(DORSAL_CRANIAL_OR_NECK_EXTENSION_PATTERNS, text))
        violations.push('DORSAL_CRANIAL_OR_NECK_EXTENSION')
    if (matchesOne(DORSAL_FORBIDDEN_MORPHOLOGY_PATTERNS, text)) violations.push('DORSAL_FORBIDDEN_MORPHOLOGY')
    if (matchesOne(DORSAL_EXCESSIVE_SCALE_PATTERNS, text)) violations.push('DORSAL_EXCESSIVE_SCALE')
    if (matchesOne(DORSAL_PRESENTATION_LEAK_PATTERNS, text)) violations.push('DORSAL_PRESENTATION_LEAK')

    return { valid: violations.length === 0, violations }
}

/** Produces a compact, bounded retry hint without feeding the rejected concept back to the model. */
export function describeFluxMicroConceptSemanticRetry(
    violations: readonly FluxMicroConceptSemanticViolationCode[],
): string | null {
    if (!violations.length) return null
    const reasons = [...new Set(violations)].map((violation) => RETRY_REASON_BY_VIOLATION[violation]).join(', ')
    return `DORSAL SEMANTIC RETRY: the previous candidate failed ${reasons}. Start posterior to the nape on the back or spine, preserve the skull, crown, forehead, head and neck, keep the structure local and subordinate, and preserve the original pose and presentation.`
}
