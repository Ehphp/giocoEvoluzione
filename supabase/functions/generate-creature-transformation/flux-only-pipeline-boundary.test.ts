import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { orchestrateCreatureTransformation } from './edge-orchestration.ts'

const EDGE_DIRECTORY = 'supabase/functions/generate-creature-transformation'
const SOURCE_ROOTS = ['src', 'shared', EDGE_DIRECTORY]

const REMOVED_MODULES = [
    'openai-structured-concept-model',
    'openai-creature-image-provider',
    'image-generation-service',
    'lineage-first-image-service',
    'generation-service',
    'experiment-review-repository',
    'prompt-template-v1',
    'prompt-template-v2-experimental',
    'prompt-composer',
    'concept-generator',
    'concept-validation',
    'concept-evaluation',
    'mock-concept-generator',
    'mock-creature-image-provider',
    'image-generation-profiles',
    'benchmark-plan',
    'experimental-lineage',
    'concept-creative-profiles',
]

function listSourceFiles(directory: string): string[] {
    return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`
        if (entry.isDirectory()) return listSourceFiles(path)
        return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    })
}

const sourceFiles = SOURCE_ROOTS.flatMap(listSourceFiles)

describe('FLUX-only pipeline boundary', () => {
    it('no longer ships any legacy concept or image-pipeline module', () => {
        const fileNames = sourceFiles.map((path) => path.split('/').at(-1)!)

        for (const moduleName of REMOVED_MODULES) {
            expect(fileNames, moduleName).not.toContain(`${moduleName}.ts`)
            expect(fileNames, moduleName).not.toContain(`${moduleName}.tsx`)
        }
    })

    it('has no source file importing a removed legacy module', () => {
        const offenders = sourceFiles.filter((path) => {
            const source = readFileSync(resolve(path), 'utf8')
            return REMOVED_MODULES.some((moduleName) => source.includes(`/${moduleName}.ts`))
        })

        expect(offenders).toEqual([])
    })

    it('routes no production operation to a legacy image provider', () => {
        const orchestration = readFileSync(resolve(EDGE_DIRECTORY, 'edge-orchestration.ts'), 'utf8')

        expect(orchestration).not.toMatch(/OpenAi|createRealImageProvider|createImageProvider|MockCreatureImageProvider/)
        expect(orchestration).not.toMatch(/'GENERATE_CONCEPT'|'GENERATE_IMAGE'|GENERATE_LINEAGE_FIRST_EXPERIMENT|GENERATE_CURRENT_PIPELINE_EXPERIMENT|GET_BENCHMARK_RESULTS/)
        expect(orchestration).toMatch(/generateFluxImageForAuthenticatedProfile/)
    })

    it('wires only the FLUX providers into the deployed function', () => {
        const entrypoint = readFileSync(resolve(EDGE_DIRECTORY, 'index.ts'), 'utf8')

        expect(entrypoint).toContain('FalFluxImageProvider')
        expect(entrypoint).toContain('FluxMicroConceptGenerator')
        expect(entrypoint).not.toMatch(/OpenAi|createGenerator|createRealImageProvider|createImageProvider/)
    })

    it('rejects every removed operation at the public boundary', async () => {
        for (const operation of ['GENERATE_CONCEPT', 'GENERATE_IMAGE', 'GENERATE_LINEAGE_FIRST_EXPERIMENT', 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', 'GET_BENCHMARK_RESULTS', 'SUBMIT_EXPERIMENT_REVIEW']) {
            await expect(orchestrateCreatureTransformation({
                profileId: 'profile-1', requestId: 'boundary', body: { operation, creatureId: 'creature', idempotencyKey: 'key' },
            } as never), operation).resolves.toMatchObject({ success: false, code: 'OPERATION_NOT_IMPLEMENTED' })
        }
    })

    it('keeps the shared domain free of the legacy structured concept vocabulary', () => {
        const sharedFiles = listSourceFiles('shared/creature-transformations').filter((path) => !path.endsWith('.test.ts'))
        const offenders = sharedFiles.filter((path) => /CreatureTransformationConcept\b|primaryMutation|mutationArchetype|colorEvolution/.test(readFileSync(resolve(path), 'utf8')))

        expect(offenders).toEqual([])
    })
})
