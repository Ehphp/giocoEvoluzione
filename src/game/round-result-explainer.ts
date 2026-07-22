import type { Environment, RoundValueBreakdown } from './types'

export type RoundExplanationInput = {
    environment: Environment | null
    meWon: boolean | null
    meActionType: 'USE' | 'EVOLVE' | null
    opponentActionType: 'USE' | 'EVOLVE' | null
    myBreakdown?: RoundValueBreakdown | null
    opponentBreakdown?: RoundValueBreakdown | null
}

const ENVIRONMENT_LABELS: Record<Environment, string> = {
    FOREST: 'Foresta',
    MOUNTAIN: 'Montagna',
    SWAMP: 'Palude',
}

function getEnvironmentName(environment: Environment | null): string {
    if (!environment) {
        return 'l ambiente corrente'
    }

    return ENVIRONMENT_LABELS[environment]
}

export function getRoundExplanation(input: RoundExplanationInput): string {
    const environmentName = getEnvironmentName(input.environment)

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

    if (loserBreakdown.environmentModifier > winnerBreakdown.environmentModifier && winnerBreakdown.levelContribution > loserBreakdown.levelContribution) {
        return input.meWon
            ? 'Il livello superiore ha compensato la minore affinità ambientale.'
            : `Il tuo gene era più adatto alla ${environmentName}, ma il livello non è bastato.`
    }

    if (winnerBreakdown.environmentContribution > loserBreakdown.environmentContribution) {
        return input.meWon
            ? `Hai vinto grazie alla maggiore affinità con la ${environmentName}.`
            : `Hai perso per minore affinità con la ${environmentName}.`
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
