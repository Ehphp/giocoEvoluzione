export const BODY_AREAS = Object.freeze([
    'HEAD_SURFACE',
    'EYE_REGION',
    'FACE',
    'NECK',
    'BACK',
    'CHEST',
    'FORELIMBS',
    'HIND_LIMBS',
    'WINGS',
    'TENTACLES',
    'TAIL',
    'SKIN_SURFACE',
] as const)

export type BodyArea = (typeof BODY_AREAS)[number]
