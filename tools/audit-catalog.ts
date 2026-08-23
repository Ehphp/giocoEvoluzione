import { ROUND_EVENT_DEFINITIONS, validateCatalog } from '../shared/game-rules/index.ts'
export function validateProductionCatalog(): void {
    const errors = validateCatalog()
    if (errors.length) throw new Error(errors.join('\n'))
    if (
        ROUND_EVENT_DEFINITIONS.some((event) =>
            Object.values(event.modifiers).some((value) => ![0, 1, 2].includes(value)),
        )
    )
        throw new Error('Event affinities must remain 0, 1 or 2.')
}
