import type { CombatMutationEffect, RoundValueBreakdown } from './types'

/** UI copy for effects already resolved authoritatively by shared/game-rules. */
export function getCombatMutationEffectDescription(effect: CombatMutationEffect): string {
    if (effect.id === 'ELASTIC_LIMBS') return 'Arti elastici: Agilità resta disponibile.'
    if (effect.id === 'ARMORED_MEMORY') return 'Memoria corazzata: Armatura resta disponibile.'
    if (effect.id === 'RECOVERY_SURGE') return 'Impulso di recupero: +1 valore round.'
    if (effect.effect === 'CORE_ARMED') return 'Nucleo adattivo caricato: il prossimo USA ottiene +1.'
    return 'Nucleo adattivo: +1 valore round.'
}

export type RoundExplanationInput = {
    roundEventTitle: string | null
    meWon: boolean | null
    meActionType: 'USE' | 'EVOLVE' | 'ACTIVATE_MUTATION' | null
    opponentActionType: 'USE' | 'EVOLVE' | 'ACTIVATE_MUTATION' | null
    myBreakdown?: RoundValueBreakdown | null
    opponentBreakdown?: RoundValueBreakdown | null
}
export function getRoundExplanation(input: RoundExplanationInput): string {
    const eventName = input.roundEventTitle ?? 'l evento del round'
    if (!input.myBreakdown || !input.opponentBreakdown)
        return 'Risultato storico: dettagli di calcolo non disponibili per questo round.'
    if (input.meActionType === 'ACTIVATE_MUTATION' && input.opponentActionType === 'ACTIVATE_MUTATION')
        return 'Entrambi avete creato una Simbiosi: i legami saranno attivi dal prossimo round.'
    if (input.meActionType === 'ACTIVATE_MUTATION')
        return 'Hai creato una Simbiosi: questo round vale 0 punti, ma il legame sara attivo dal prossimo round.'
    if (input.opponentActionType === 'ACTIVATE_MUTATION')
        return 'L avversario ha creato una Simbiosi: il suo legame sara attivo dal prossimo round.'
    if (input.meActionType === 'EVOLVE' && input.opponentActionType === 'EVOLVE')
        return 'Entrambi avete evoluto o recuperato un adattamento: il valore base e 1; eventuali effetti mutazione sono indicati nei dettagli.'
    if (input.meActionType === 'EVOLVE')
        return 'Hai evoluto o recuperato un adattamento: il valore base e 1, senza affinita ambientale ne vantaggio naturale; eventuali effetti mutazione sono indicati nei dettagli.'
    if (input.opponentActionType === 'EVOLVE')
        return 'L avversario ha evoluto o recuperato un adattamento: valore base 1, senza affinita ambientale ne vantaggio naturale; eventuali effetti mutazione sono indicati nei dettagli.'
    if (input.meWon === null) return 'Entrambi i geni hanno prodotto lo stesso valore.'
    const winner = input.meWon ? input.myBreakdown : input.opponentBreakdown
    const loser = input.meWon ? input.opponentBreakdown : input.myBreakdown
    if (winner.matchupBonus > loser.matchupBonus)
        return input.meWon
            ? 'Hai vinto grazie al vantaggio naturale.'
            : 'Hai perso per il vantaggio naturale avversario.'
    if (winner.eventModifier > loser.eventModifier)
        return input.meWon
            ? `Hai vinto grazie all affinita ideale con ${eventName}.`
            : `Hai perso per un affinita ambientale meno adatta in ${eventName}.`
    if (winner.levelContribution > loser.levelContribution)
        return input.meWon
            ? 'Hai vinto grazie al livello effettivo superiore.'
            : 'Hai perso contro un livello effettivo superiore.'
    return input.meWon
        ? 'Hai vinto grazie a un totale round leggermente superiore.'
        : 'Hai perso per un totale round leggermente inferiore.'
}
