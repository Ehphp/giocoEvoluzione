import type { CreatureSemanticIdentity, ResolvedCreatureSource } from '../../../shared/creature-transformations/contracts.ts'
import type { PreviousCreatureTransformationSummary } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import type { BodyPlanMutationId } from '../../../shared/creature-transformations/flux-evolution/body-plan-mutations.ts'
import { resolveCanonicalBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'

export const TEST_CREATURE_IDENTITY: CreatureSemanticIdentity = {
    creatureId: '00000000-0000-4000-8000-000000000001',
    baseCreatureKey: 'VERDANT_HATCHLING',
    description: 'Piccolo drago verde con grandi occhi ambrati.',
    identityFeatures: ['grandi occhi ambrati', 'cresta dorsale di spine fogliari'],
    mutableVisualFeatures: ['corpo verde'],
    styleDefinition: 'Illustrazione 3D stilizzata.',
}

/** A resolved source whose canonical body plan is derived exactly as production derives it. */
export function createResolvedCreatureSource(overrides: Partial<ResolvedCreatureSource> & { previousTransformations?: PreviousCreatureTransformationSummary[] } = {}): ResolvedCreatureSource {
    const previousTransformations = overrides.previousTransformations ?? []
    const adoptedBodyPlanMutationIds = overrides.adoptedBodyPlanMutationIds
        ?? previousTransformations.flatMap((entry): BodyPlanMutationId[] => (entry.bodyPlanMutationId ? [entry.bodyPlanMutationId] : []))
    return {
        identity: TEST_CREATURE_IDENTITY,
        sourceImagePath: 'verdant-hatchling-v1.png',
        sourceSha256: 'a'.repeat(64),
        sourceIsBaseVersion: true,
        currentVisualVersionId: '00000000-0000-4000-8000-000000000010',
        currentVersionNumber: 1,
        previousTransformations,
        adoptedBodyPlanMutationIds,
        bodyPlan: resolveCanonicalBodyPlan({ baseCreatureKey: TEST_CREATURE_IDENTITY.baseCreatureKey, adoptedBodyPlanMutationIds }),
        ...overrides,
    }
}

export function createTestResolver(source = createResolvedCreatureSource()) {
    return { async resolve() { return source } }
}

/** Accepts the canonical source render on odd calls and the raw FLUX render on even ones. */
export class FluxTestValidator extends ImageValidator {
    calls = 0

    override async validate() {
        this.calls += 1
        const source = this.calls % 2 === 1
        return {
            valid: true as const,
            metadata: {
                mimeType: 'image/png' as const,
                width: source ? 1024 : 768,
                height: source ? 1536 : 1152,
                colorType: 6,
                hasAlpha: source,
                sha256: `${this.calls}`.padStart(64, 'a'),
                bytes: 256,
            },
            warnings: [],
        }
    }
}

export function createTestStorage(overrides: Record<string, unknown> = {}) {
    return {
        async readCanonicalSource() { return { bytes: createTestPng(), mimeType: 'image/png' as const } },
        async readExperimentalSource() { return { bytes: createTestPng(), mimeType: 'image/png' as const } },
        async readVisualVersionSource() { return { bytes: createTestPng(), mimeType: 'image/png' as const } },
        async saveRawResult() { return { signedUrl: 'https://signed.example/raw.png', expiresAt: '2030-01-01T00:00:00.000Z' } },
        async createVisualVersionSignedUrl() { return { signedUrl: 'https://signed.example/source.png', expiresAt: '2030-01-01T00:00:00.000Z' } },
        async createRawResultObjectPath() { return `experiments/raw/profile-1/${'a'.repeat(64)}.png` },
        ...overrides,
    }
}
