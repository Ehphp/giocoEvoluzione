import { TOTAL_ROUNDS, TRAIT_LABELS, TRAITS } from '../../../game/config'
import { isTraitEvolvable, isTraitUsable } from '../../../game/engine'
import { getRoundEventEffectsForTrait } from '../../../game/round-events'
import { getValidatedTraitUseBreakdown } from '../../../game/scoring'
import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import { getRoundEventLabel } from '../../../game/ui-context'
import type { TraitCollection, TraitType } from '../../../game/types'
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

function validateTraits(traits: TraitCollection | null | undefined): boolean {
    if (!traits) {
        return false
    }

    return TRAITS.every((trait) => {
        const state = traits[trait]

        return state && typeof state.level === 'number' && typeof state.cooldown === 'number'
    })
}

function isSnapshotPlayable(snapshot: GameSnapshot): { valid: boolean; reason?: string } {
    if (!snapshot.me) {
        return { valid: false, reason: 'Dati giocatore non disponibili.' }
    }

    if (!validateTraits(snapshot.me.traits)) {
        return { valid: false, reason: 'I tratti della creatura non sono validi o sono incompleti. Crea una nuova partita.' }
    }

    const hasEventSequence = Array.isArray(snapshot.game.round_event_sequence) && snapshot.game.round_event_sequence.length >= snapshot.game.current_round

    if (!hasEventSequence || !snapshot.currentRoundEvent) {
        return { valid: false, reason: 'La partita non ha un evento valido per questo round. La sessione e obsoleta: crea una nuova partita.' }
    }

    return { valid: true }
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

    const effects = [...roundEvent.effects].filter((effect) => Number.isFinite(effect.modifier))
    const positive = effects
        .filter((effect) => effect.modifier > 0)
        .sort((a, b) => b.modifier - a.modifier)[0]
    const negative = effects
        .filter((effect) => effect.modifier < 0)
        .sort((a, b) => a.modifier - b.modifier)[0]

    const picked: RoundEventEffectV2[] = []

    if (positive) {
        picked.push({
            id: `${roundEvent.id}-${positive.trait}-pos`,
            label: TRAIT_LABELS[positive.trait],
            value: `+${positive.modifier} ${TRAIT_LABELS[positive.trait]}`,
            tone: 'positive',
        })
    }

    if (negative) {
        picked.push({
            id: `${roundEvent.id}-${negative.trait}-neg`,
            label: TRAIT_LABELS[negative.trait],
            value: `${negative.modifier} ${TRAIT_LABELS[negative.trait]}`,
            tone: 'negative',
        })
    }

    return picked
}

function buildGenes(snapshot: GameSnapshot): GeneCardV2[] {
    const roundEvent = snapshot.currentRoundEvent
    const myTraits = snapshot.me?.traits

    if (!myTraits) {
        return []
    }

    return [...TRAITS]
        .sort((a, b) => TRAIT_CATALOG[a].displayOrder - TRAIT_CATALOG[b].displayOrder)
        .map((traitType): GeneCardV2 | null => {
            const state = myTraits[traitType]
            if (!state) {
                return null
            }

            const affinity = roundEvent
                ? getRoundEventEffectsForTrait(roundEvent, traitType).reduce((sum, effect) => sum + effect.modifier, 0)
                : 0
            const usable = isTraitUsable(myTraits, traitType)
            const prediction = roundEvent
                ? getValidatedTraitUseBreakdown(roundEvent, myTraits, traitType)
                : null

            return {
                id: traitType,
                traitType,
                name: TRAIT_LABELS[traitType],
                level: state.level,
                affinity: mapAffinity(affinity),
                imageUrl: getGeneAssetByTrait(traitType),
                usable,
                disabledReason: usable ? undefined : `Cooldown ${state.cooldown}`,
                prediction: prediction
                    ? {
                        useScore: prediction.total,
                        levelContribution: prediction.levelContribution,
                        eventContribution: prediction.eventContribution,
                        reasons: prediction.appliedEventEffects.map((effect) => effect.reason),
                    }
                    : undefined,
            }
        })
        .filter((gene): gene is GeneCardV2 => gene !== null)
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
    const playability = isSnapshotPlayable(snapshot)
    const genes = buildGenes(snapshot)
    const selectedGene = resolveSelectedGene(genes, input.selectedGeneId)
    const selectedGeneId = selectedGene?.id ?? null
    const myHasSubmitted = Boolean(snapshot.myCurrentAction) || input.hasLocalSubmittedAction
    const opponentHasSubmitted = resolveOpponentSubmitted(snapshot)

    const opponent = snapshot.opponent

    if (!playability.valid || !me) {
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
                imageUrl: GAME_SELECTION_ASSETS.environment,
                effects: [],
            },
            genes: [],
            selectedGeneId: null,
            selectedAction: null,
            selectedGene: null,
            status: 'invalid',
            actionsSubmitted: snapshot.actionsSubmitted,
            canUse: false,
            canEvolve: false,
            canSelectGenes: false,
            invalidReason: playability.reason ?? 'Sessione non valida.',
        }
    }

    let status: GeneSelectionStatusV2 = 'choosing'

    if (input.submitErrorMessage) {
        status = 'error'
    } else if (input.isSubmitting) {
        status = 'submitting'
    } else if (myHasSubmitted && snapshot.actionsSubmitted >= 2) {
        status = 'resolving'
    } else if (myHasSubmitted) {
        status = isVsBot ? 'resolving' : 'waiting'
    }

    const canSelectGenes = status === 'choosing' || status === 'error'
    const canEvolve = Boolean(
        selectedGene
        && snapshot.me
        && isTraitEvolvable(snapshot.me.traits, selectedGene.traitType),
    ) && (status === 'choosing' || status === 'error')
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
            id: snapshot.currentRoundEvent?.id ?? 'unknown-event',
            title: getRoundEventLabel(snapshot.currentRoundEvent ?? null),
            description: snapshot.currentRoundEvent?.shortDescription ?? 'Evento in caricamento.',
            imageUrl: snapshot.currentRoundEvent
                ? getEventAssetByArtKey(snapshot.currentRoundEvent.artKey)
                : GAME_SELECTION_ASSETS.environment,
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
