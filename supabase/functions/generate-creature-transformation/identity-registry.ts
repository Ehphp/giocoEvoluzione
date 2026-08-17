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
        sourceImagePath: 'verdant-hatchling/e0b9875bc155ffa2ba00e7d83e86c8e791ccc48d539c11d3fcfd5d7fced65605.png',
        description: 'A stylized fantasy creature with a distinctive, recognizable visual identity.',
        identityFeatures: ['distinctive individual identity'],
        mutableVisualFeatures: ['visual characteristics'],
        styleDefinition: 'A polished, stylized 3D creature illustration.',
    }),
})
