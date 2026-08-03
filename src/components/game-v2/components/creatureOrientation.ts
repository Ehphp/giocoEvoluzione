export type CreatureFacing = 'left' | 'right'

/** Returns whether an image needs mirroring to face its assigned opponent. */
export function shouldMirrorCreature(nativeFacing: CreatureFacing = 'right', facing: CreatureFacing): boolean {
    return nativeFacing !== facing
}
