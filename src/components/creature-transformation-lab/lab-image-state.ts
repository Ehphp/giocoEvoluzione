import type { GenerateConceptResponse } from '../../../shared/creature-transformations/index.ts'

export function canGenerateMockImage(
    conceptResult: GenerateConceptResponse | null,
    isGeneratingConcept: boolean,
    isGeneratingImage: boolean,
): boolean {
    return Boolean(conceptResult?.evaluation.acceptable) && !isGeneratingConcept && !isGeneratingImage
}
