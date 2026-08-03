export type CreatureIdentityDefinition = Readonly<{
    baseCreatureKey: string
    sourceImagePath: string
    description: string
    identityFeatures: readonly string[]
    mutableVisualFeatures: readonly string[]
    styleDefinition: string
}>

function defineIdentity(definition: CreatureIdentityDefinition): CreatureIdentityDefinition {
    return Object.freeze({
        ...definition,
        identityFeatures: Object.freeze([...definition.identityFeatures]),
        mutableVisualFeatures: Object.freeze([...definition.mutableVisualFeatures]),
    })
}

export const CREATURE_IDENTITY_REGISTRY: Readonly<Record<string, CreatureIdentityDefinition>> = Object.freeze({
    VERDANT_HATCHLING: defineIdentity({
        baseCreatureKey: 'VERDANT_HATCHLING',
        sourceImagePath: 'verdant-hatchling-v1.png',
        description: 'Piccolo drago verde con grandi occhi ambrati, corpo tozzo e cresta di spine fogliari.',
        identityFeatures: ['grandi occhi ambrati', 'corpo squamoso e tozzo', 'cresta dorsale di spine fogliari'],
        mutableVisualFeatures: ['corpo verde', 'palette verde lime'],
        styleDefinition: 'Illustrazione 3D stilizzata e luminosa, con materiali morbidi e squamosi.',
    }),
})
