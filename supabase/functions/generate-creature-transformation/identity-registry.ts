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
        sourceImagePath: '/assets/battle/creatures/verdant-hatchling.png',
        description: 'Piccolo drago verde con grandi occhi ambrati, corpo tozzo e cresta di spine fogliari.',
        identityFeatures: ['grandi occhi ambrati', 'corpo verde squamoso e tozzo', 'cresta dorsale di spine fogliari'],
        styleDefinition: 'Illustrazione 3D stilizzata e luminosa, con palette verde lime e materiali morbidi e squamosi.',
    }),
})
