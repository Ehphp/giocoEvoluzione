import { ROUND_EVENT_DEFINITIONS } from './catalog.ts'
import { ADAPTATION_IDS, type AdaptationId } from './types.ts'
export function validateCatalog(): string[] {
    const errors: string[] = []
    if (ROUND_EVENT_DEFINITIONS.length !== 6) errors.push('catalog: event-count must remain 6')
    for (const crisis of ROUND_EVENT_DEFINITIONS)
        for (const adaptation of ADAPTATION_IDS)
            if (![0, 1, 2].includes(crisis.modifiers[adaptation]))
                errors.push(`crisis=${crisis.id};adaptation=${adaptation}: modifier must be 0, 1 or 2`)
    const advantages = new Set<AdaptationId>()
    for (const adaptation of ADAPTATION_IDS) advantages.add(adaptation)
    if (advantages.size !== ADAPTATION_IDS.length) errors.push('adaptation ids must be unique')
    return errors
}
