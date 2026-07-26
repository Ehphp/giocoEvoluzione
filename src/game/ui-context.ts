import type { RoundEventDefinition } from './types'

export function getRoundEventLabel(roundEvent: RoundEventDefinition | null): string {
    return roundEvent?.title ?? 'Evento non disponibile'
}
