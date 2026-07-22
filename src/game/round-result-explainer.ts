import type { RoundValueBreakdown } from './types'

export type RoundExplanationInput = {
    roundEventTitle: string | null
    meWon: boolean | null
    meActionType: 'USE' | 'EVOLVE' | null
    opponentActionType: 'USE' | 'EVOLVE' | null
    myBreakdown?: RoundValueBreakdown | null
    opponentBreakdown?: RoundValueBreakdown | null
}

export function getRoundExplanation(input: RoundExplanationInput): string {
    const eventName = input.roundEventTitle ?? 'l evento del round'

    if (!input.myBreakdown || !input.opponentBreakdown) {
        return 'Risultato storico: dettagli di calcolo non disponibili per questo round.'
    }

    if (input.meActionType === 'EVOLVE' && input.opponentActionType === 'EVOLVE') {
        return 'Entrambi avete evoluto il gene, rinunciando al punteggio di questo round.'
    }

    if (input.meActionType === 'EVOLVE' && input.opponentActionType === 'USE') {
        return 'Hai evoluto il gene, rinunciando al punteggio di questo round.'
    }

    if (input.meActionType === 'USE' && input.opponentActionType === 'EVOLVE') {
        return 'L avversario ha evoluto il gene, rinunciando al punteggio di questo round.'
    }

    if (input.meWon === null) {
        return 'Entrambi i geni hanno prodotto lo stesso valore.'
    }

    const winnerBreakdown = input.meWon ? input.myBreakdown : input.opponentBreakdown
    const loserBreakdown = input.meWon ? input.opponentBreakdown : input.myBreakdown

    if (loserBreakdown.eventModifierTotal > winnerBreakdown.eventModifierTotal && winnerBreakdown.levelContribution > loserBreakdown.levelContribution) {
        return input.meWon
            ? 'Il livello superiore ha compensato una penalita evento piu severa.'
            : `Il tuo gene era favorito in ${eventName}, ma il livello non e bastato.`
    }

    if (winnerBreakdown.eventContribution > loserBreakdown.eventContribution) {
        return input.meWon
            ? `Hai vinto grazie agli effetti favorevoli di ${eventName}.`
            : `Hai perso per effetti evento meno favorevoli in ${eventName}.`
    }

    if (winnerBreakdown.levelContribution > loserBreakdown.levelContribution) {
        return input.meWon
            ? 'Hai vinto grazie al livello effettivo superiore.'
            : 'Hai perso contro un livello effettivo superiore.'
    }

    return input.meWon
        ? 'Hai vinto grazie a un totale round leggermente superiore.'
        : 'Hai perso per un totale round leggermente inferiore.'
}
