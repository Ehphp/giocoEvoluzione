import type { RoundValueBreakdown } from './types'

export type RoundExplanationInput = { roundEventTitle: string | null; meWon: boolean | null; meActionType: 'USE' | 'EVOLVE' | null; opponentActionType: 'USE' | 'EVOLVE' | null; myBreakdown?: RoundValueBreakdown | null; opponentBreakdown?: RoundValueBreakdown | null }
export function getRoundExplanation(input: RoundExplanationInput): string {
    const eventName = input.roundEventTitle ?? 'l evento del round'
    if (!input.myBreakdown || !input.opponentBreakdown) return 'Risultato storico: dettagli di calcolo non disponibili per questo round.'
    if (input.meActionType === 'EVOLVE' && input.opponentActionType === 'EVOLVE') return 'Entrambi avete evoluto o recuperato un adattamento: ciascuno ottiene il valore fisso di 1.'
    if (input.meActionType === 'EVOLVE') return 'Hai evoluto o recuperato un adattamento: il valore fisso e 1, senza affinita ambientale ne vantaggio naturale.'
    if (input.opponentActionType === 'EVOLVE') return 'L avversario ha evoluto o recuperato un adattamento: valore fisso 1, senza affinita ambientale ne vantaggio naturale.'
    if (input.meWon === null) return 'Entrambi i geni hanno prodotto lo stesso valore.'
    const winner = input.meWon ? input.myBreakdown : input.opponentBreakdown
    const loser = input.meWon ? input.opponentBreakdown : input.myBreakdown
    if (winner.matchupBonus > loser.matchupBonus) return input.meWon ? 'Hai vinto grazie al vantaggio naturale.' : 'Hai perso per il vantaggio naturale avversario.'
    if (winner.eventModifier > loser.eventModifier) return input.meWon ? `Hai vinto grazie all affinita ideale con ${eventName}.` : `Hai perso per un affinita ambientale meno adatta in ${eventName}.`
    if (winner.levelContribution > loser.levelContribution) return input.meWon ? 'Hai vinto grazie al livello effettivo superiore.' : 'Hai perso contro un livello effettivo superiore.'
    return input.meWon ? 'Hai vinto grazie a un totale round leggermente superiore.' : 'Hai perso per un totale round leggermente inferiore.'
}
