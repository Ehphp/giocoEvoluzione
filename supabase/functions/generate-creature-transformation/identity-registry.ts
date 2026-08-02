export type CreatureIdentityDefinition = Readonly<{
    baseCreatureKey: string
    sourceImagePath: string
    description: string
    identityFeatures: readonly string[]
    styleDefinition: string
}>

function defineIdentity(definition: CreatureIdentityDefinition): CreatureIdentityDefinition {
    return Object.freeze({
        ...definition,
        identityFeatures: Object.freeze([...definition.identityFeatures]),
    })
}

export const CREATURE_IDENTITY_REGISTRY: Readonly<Record<string, CreatureIdentityDefinition>> = Object.freeze({
    VERDANT_HATCHLING: defineIdentity({
        baseCreatureKey: 'VERDANT_HATCHLING',
        sourceImagePath: '/assets/creatures/base.png',
        description: 'Piccola creatura turchese con volto a mezzaluna e coda corta.',
        identityFeatures: ['volto a mezzaluna', 'palette turchese', 'coda corta'],
        styleDefinition: 'Illustrazione organica con linee morbide e materiali naturali.',
    }),
})

