import type { WorldDefinition } from './types'

export const WORLD_DEFINITIONS: WorldDefinition[] = [
    {
        id: 'AURELIA_PRIME',
        name: 'Aurelia Prime',
        planetName: 'Aurelia',
        backgroundArtKey: 'world-aurelia-prime',
        paletteKey: 'aurelia-amber',
    },
]

export const DEFAULT_WORLD_ID = WORLD_DEFINITIONS[0]?.id ?? 'AURELIA_PRIME'

const WORLD_BY_ID = WORLD_DEFINITIONS.reduce<Record<string, WorldDefinition>>((accumulator, world) => {
    accumulator[world.id] = world

    return accumulator
}, {})

export function getWorldById(worldId: string): WorldDefinition {
    const world = WORLD_BY_ID[worldId]

    if (!world) {
        throw new Error(`Unknown world \"${worldId}\".`)
    }

    return world
}
