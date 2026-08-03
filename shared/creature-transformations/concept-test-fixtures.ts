import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'

export const TEST_CREATURE_IDENTITY: CreatureSemanticIdentity = {
    creatureId: 'creature-luma',
    baseCreatureKey: 'LUMA',
    description: 'Piccola creatura turchese con volto a mezzaluna e coda corta.',
    identityFeatures: ['volto a mezzaluna', 'coda corta'],
    mutableVisualFeatures: ['corpo turchese', 'palette turchese'],
    styleDefinition: 'Illustrazione organica con linee morbide e materiali naturali.',
}

export function createValidConcept(): CreatureTransformationConcept {
    return {
        schemaVersion: 1,
        visualTrait: 'IMPACT_ADAPTATION',
        conceptName: 'Guscio ammortizzato',
        evolutionaryFunction: 'Riduce gli urti sul dorso mantenendo il movimento naturale della creatura.',
        primaryMutation: {
            mutationArchetype: 'ELASTIC_CUSHIONING',
            bodyAreas: ['BACK'],
            morphology: 'Cuscinetti elastici compatti seguono il dorso in una fascia continua e riconoscibile.',
            material: 'Tessuto fibroso opaco con leggere venature turchesi.',
        },
        secondaryMutations: ['Giunti ammortizzati lungo il dorso'],
        identityToPreserve: [...TEST_CREATURE_IDENTITY.identityFeatures],
        forbiddenChanges: ['Cambio di specie', 'Sostituzione del volto'],
        intensity: 2,
    }
}
