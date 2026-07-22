import { TOTAL_ROUNDS, TRAIT_LABELS } from '../../../game/config'
import { getTraitRoundValue, isTraitUsable } from '../../../game/engine'
import { getRoundEventEffectsForTrait } from '../../../game/round-events'
import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import { getRoundEventLabel } from '../../../game/ui-context'
import type { TraitType } from '../../../game/types'
import type { GameSnapshot } from '../../../lib/game-api'
import { GAME_SELECTION_ASSETS, getEventAssetByArtKey, getGeneAssetByTrait } from '../gameSelectionAssets'
import type {
    DuelPlayerStatusV2,
    GeneActionTypeV2,
    GeneAffinityV2,
    GeneCardV2,
    RoundEventEffectV2,
    GeneSelectionStatusV2,
    GeneSelectionViewModelV2,
} from '../types'

type BuildGeneSelectionV2ViewModelInput = {
    snapshot: GameSnapshot
    myScore: number
    opponentScore: number
    selectedGeneId: string | null
    selectedAction: GeneActionTypeV2 | null
    isSubmitting: boolean
    submitErrorMessage: string | null
    hasLocalSubmittedAction: boolean
    localSubmittedAction: { trait: TraitType; actionType: GeneActionTypeV2 } | null
}

function mapAffinity(score: number): GeneAffinityV2 {
    if (score >= 2) {
        return 'excellent'
    }

    if (score >= 1) {
        return 'high'
    }

    if (score === 0) {
        return 'medium'
    }

    return 'low'
}

function resolveOpponentSubmitted(snapshot: GameSnapshot): boolean {
    if (!snapshot.opponent) {
        return false
    }

    if (snapshot.actionsSubmitted >= 2) {
        return true
    }

    if (!snapshot.myCurrentAction && snapshot.actionsSubmitted === 1) {
        return true
    }

    return false
}

function resolvePlayerStatus(hasSubmitted: boolean, connected: boolean): DuelPlayerStatusV2 {
    if (!connected) {
        return 'disconnected'
    }

    return hasSubmitted ? 'ready' : 'choosing'
}

function buildRoundEventEffects(snapshot: GameSnapshot): RoundEventEffectV2[] {
    const roundEvent = snapshot.currentRoundEvent

    if (!roundEvent) {
        return []
    }

    const sorted = [...roundEvent.effects].sort((left, right) => right.modifier - left.modifier)

    return sorted.map((effect, index) => {
        const tone = effect.modifier > 0 ? 'positive' : effect.modifier < 0 ? 'negative' : 'neutral'
        const signedValue = effect.modifier >= 0 ? `+${effect.modifier}` : `${effect.modifier}`

        return {
            id: `${roundEvent.id}-${effect.trait}-${index}`,
            label: TRAIT_LABELS[effect.trait],
            value: `${signedValue} ${TRAIT_LABELS[effect.trait]}`,
            reason: effect.reason,
            tone,
        }
    })
}

function buildGenes(snapshot: GameSnapshot): GeneCardV2[] {
    const roundEvent = snapshot.currentRoundEvent
    const myTraits = snapshot.me?.traits

    if (!roundEvent || !myTraits) {
        return []
    }

    return (Object.keys(myTraits) as TraitType[])
        .sort((a, b) => TRAIT_CATALOG[a].displayOrder - TRAIT_CATALOG[b].displayOrder)
        .map((traitType) => {
            const state = myTraits[traitType]
            const affinity = getRoundEventEffectsForTrait(roundEvent, traitType)
                .reduce((sum, effect) => sum + effect.modifier, 0)
            const usable = isTraitUsable(myTraits, traitType)

            return {
                id: traitType,
                traitType,
                name: TRAIT_LABELS[traitType],
                level: state.level,
                affinity: mapAffinity(affinity),
                imageUrl: getGeneAssetByTrait(traitType),
                description: TRAIT_CATALOG[traitType].description,
                predictedValue: getTraitRoundValue(roundEvent, myTraits, traitType),
                usable,
                disabledReason: usable ? undefined : `Cooldown ${state.cooldown}`,
            }
        })
}

function resolveSelectedGene(genes: GeneCardV2[], selectedGeneId: string | null): GeneCardV2 | null {
    if (!genes.length) {
        return null
    }

    if (selectedGeneId) {
        return genes.find((gene) => gene.id === selectedGeneId) ?? genes[0]
    }

    return genes[0]
}

export function buildGeneSelectionV2ViewModel(input: BuildGeneSelectionV2ViewModelInput): GeneSelectionViewModelV2 {
    const { snapshot } = input
    const me = snapshot.me
    const isVsBot = snapshot.game.game_mode === 'VS_BOT'

    if (!me) {
        return {
            player: {
                id: 'unknown',
                name: 'Tu',
                score: 0,
                avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
                status: 'choosing',
            },
            opponent: {
                id: 'unknown-opponent',
                name: 'Avversario',
                score: 0,
                avatarUrl: GAME_SELECTION_ASSETS.opponentAvatar,
                status: 'choosing',
            },
            round: {
                current: snapshot.game.current_round,
                total: TOTAL_ROUNDS,
            },
            roundEvent: {
                id: 'unknown-event',
                title: 'Evento non disponibile',
                description: 'Dati evento non disponibili.',
                category: 'N/A',
                intensity: 1,
                artKey: 'event-missing',
                imageUrl: GAME_SELECTION_ASSETS.environment,
                effects: [],
            },
            genes: [],
            selectedGeneId: null,
            selectedAction: null,
            selectedGene: null,
            status: 'loading',
            actionsSubmitted: snapshot.actionsSubmitted,
            canUse: false,
            canEvolve: false,
            canSelectGenes: false,
            errorMessage: 'Dati giocatore non disponibili.',
        }
    }

    const opponent = snapshot.opponent
    const roundEvent = snapshot.currentRoundEvent
    const genes = buildGenes(snapshot)
    const selectedGene = resolveSelectedGene(genes, input.selectedGeneId)
    const selectedGeneId = selectedGene?.id ?? null
    const myHasSubmitted = Boolean(snapshot.myCurrentAction) || input.hasLocalSubmittedAction
    const opponentHasSubmitted = resolveOpponentSubmitted(snapshot)

    let status: GeneSelectionStatusV2 = 'choosing'

    if (!roundEvent) {
        status = 'loading'
    } else if (input.submitErrorMessage) {
        status = 'error'
    } else if (input.isSubmitting) {
        status = 'submitting'
    } else if (myHasSubmitted && snapshot.actionsSubmitted >= 2) {
        status = 'resolving'
    } else if (myHasSubmitted) {
        status = isVsBot ? 'resolving' : 'waiting'
    }

    const canSelectGenes = status === 'choosing' || status === 'error'
    const canEvolve = Boolean(selectedGene) && (status === 'choosing' || status === 'error')
    const canUse = Boolean(selectedGene?.usable) && (status === 'choosing' || status === 'error')

    const submittedAction = snapshot.myCurrentAction
        ? { trait: snapshot.myCurrentAction.trait, actionType: snapshot.myCurrentAction.action_type }
        : input.localSubmittedAction

    const submittedGene = submittedAction ? genes.find((gene) => gene.traitType === submittedAction.trait) : selectedGene

    return {
        player: {
            id: me.id,
            name: me.nickname,
            score: input.myScore,
            avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
            status: resolvePlayerStatus(myHasSubmitted, me.connected),
        },
        opponent: {
            id: opponent?.id ?? 'opponent-pending',
            name: opponent?.nickname ?? 'In attesa',
            score: input.opponentScore,
            avatarUrl: GAME_SELECTION_ASSETS.opponentAvatar,
            status: resolvePlayerStatus(opponentHasSubmitted, opponent?.connected ?? false),
        },
        round: {
            current: snapshot.game.current_round,
            total: TOTAL_ROUNDS,
        },
        roundEvent: {
            id: roundEvent?.id ?? 'unknown-event',
            title: getRoundEventLabel(roundEvent ?? null),
            description: roundEvent?.shortDescription ?? 'Evento in caricamento.',
            category: roundEvent?.category ?? 'N/A',
            intensity: roundEvent?.intensity ?? 1,
            artKey: roundEvent?.artKey ?? 'event-missing',
            imageUrl: roundEvent ? getEventAssetByArtKey(roundEvent.artKey) : GAME_SELECTION_ASSETS.environment,
            effects: buildRoundEventEffects(snapshot),
        },
        genes,
        selectedGeneId,
        selectedAction: submittedAction?.actionType ?? input.selectedAction,
        selectedGene,
        status,
        actionsSubmitted: snapshot.actionsSubmitted,
        canUse,
        canEvolve,
        canSelectGenes,
        errorMessage: input.submitErrorMessage ?? undefined,
        waitingState: submittedAction && submittedGene
            ? {
                submittedGeneName: submittedGene.name,
                submittedAction: submittedAction.actionType,
                submittedCountLabel: isVsBot && myHasSubmitted
                    ? '1/1'
                    : `${Math.min(snapshot.actionsSubmitted, 2)}/2`,
                opponentStatusLabel: isVsBot
                    ? 'Il bot sta scegliendo'
                    : opponentHasSubmitted
                        ? 'Scelta avversario ricevuta'
                        : 'In attesa dell avversario',
                isResolving: snapshot.actionsSubmitted >= 2 || (isVsBot && myHasSubmitted),
            }
            : undefined,
    }
}

export type { BuildGeneSelectionV2ViewModelInput }