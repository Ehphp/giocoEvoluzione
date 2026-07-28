import { TOTAL_ROUNDS, TRAIT_LABELS, TRAITS } from '../../../game/config'
import { isTraitEvolvable, isTraitUsable } from '../../../game/engine'
import { getRoundEventEffectsForTrait } from '../../../game/round-events'
import { getValidatedTraitUseBreakdown } from '../../../game/scoring'
import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import { getRoundEventLabel } from '../../../game/ui-context'
import type { RoundEventDefinition, TraitCollection, TraitType } from '../../../game/types'
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

export function buildRoundEventEffects(roundEvent: RoundEventDefinition, includeAll = false): RoundEventEffectV2[] {
    const effects = [...roundEvent.effects].filter((effect) => Number.isFinite(effect.modifier))
    if (includeAll) {
        return effects
            .filter((effect) => effect.modifier !== 0)
            .sort((a, b) => (
                // Show every bonus before the malus, independently of the
                // magnitude defined by a future event (for example +3).
                (Number(b.modifier > 0) - Number(a.modifier > 0))
                || (a.modifier > 0 ? b.modifier - a.modifier : a.modifier - b.modifier)
                || TRAIT_LABELS[a.trait].localeCompare(TRAIT_LABELS[b.trait], 'it')
            ))
            .map((effect) => ({
                id: `${roundEvent.id}-${effect.trait}-${effect.modifier}`,
                label: TRAIT_LABELS[effect.trait],
                modifier: effect.modifier,
                value: `${effect.modifier > 0 ? '+' : ''}${effect.modifier} ${TRAIT_LABELS[effect.trait]}`,
                tone: effect.modifier > 0 ? 'positive' : 'negative',
            }))
    }

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
            modifier: positive.modifier,
            value: `+${positive.modifier} ${TRAIT_LABELS[positive.trait]}`,
            tone: 'positive',
        })
    }

    if (negative) {
        picked.push({
            id: `${roundEvent.id}-${negative.trait}-neg`,
            label: TRAIT_LABELS[negative.trait],
            modifier: negative.modifier,
            value: `${negative.modifier} ${TRAIT_LABELS[negative.trait]}`,
            tone: 'negative',
        })
    }

    return picked
}

function getRoundValueTotal(snapshot: GameSnapshot, slot: 1 | 2): number | null {
    if (!snapshot.roundResults.length) {
        return null
    }

    return snapshot.roundResults.reduce(
        (total, result) => total + (slot === 1 ? result.player_1_value : result.player_2_value),
        0,
    )
}

function mapRoundEvent(roundEvent: RoundEventDefinition, includeAllEffects = false) {
    return {
        id: roundEvent.id,
        title: getRoundEventLabel(roundEvent),
        description: roundEvent.shortDescription,
        imageUrl: getEventAssetByArtKey(roundEvent.artKey),
        effects: buildRoundEventEffects(roundEvent, includeAllEffects),
    }
}

function compareGenesStrongestFirst(a: GeneCardV2, b: GeneCardV2): number {
    // A gene that cannot legally be used has no immediately obtainable USE value.
    // It stays in the slider, sorted deterministically with the other unavailable genes.
    const aValue = a.usable ? (a.prediction?.useScore ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY
    const bValue = b.usable ? (b.prediction?.useScore ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY

    if (aValue !== bValue) {
        return bValue - aValue
    }

    if (a.level !== b.level) {
        return b.level - a.level
    }

    // The slider is strongest -> weakest. Keep exact ties deterministic from
    // the left edge without changing their actual predicted value.
    const alphabetical = a.name.localeCompare(b.name, 'it')

    if (alphabetical !== 0) {
        return alphabetical
    }

    return TRAIT_CATALOG[a.traitType].displayOrder - TRAIT_CATALOG[b.traitType].displayOrder
}

function buildGenes(snapshot: GameSnapshot): GeneCardV2[] {
    const roundEvent = snapshot.currentRoundEvent
    const myTraits = snapshot.me?.traits

    if (!myTraits) {
        return []
    }

    return [...TRAITS]
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
                disabledReason: usable ? undefined : `Recupero ${state.cooldown}`,
                prediction: prediction
                    ? {
                        useScore: prediction.total,
                        baseContribution: prediction.baseContribution,
                        levelContribution: prediction.levelContribution,
                        eventModifier: prediction.eventModifier,
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
        return genes.find((gene) => gene.id === selectedGeneId) ?? genes[0] ?? null
    }

    return genes[0] ?? null
}

export function getBestTraitIdForSnapshot(snapshot: GameSnapshot): TraitType | null {
    return [...buildGenes(snapshot)].sort(compareGenesStrongestFirst)[0]?.traitType ?? null
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
                roundValueTotal: null,
                avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
                status: 'choosing',
            },
            opponent: {
                id: 'unknown-opponent',
                name: 'Avversario',
                score: 0,
                roundValueTotal: null,
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
            nextRoundEvent: null,
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
            roundValueTotal: getRoundValueTotal(snapshot, me.slot),
            avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
            status: resolvePlayerStatus(myHasSubmitted, me.connected),
        },
        opponent: {
            id: opponent?.id ?? 'opponent-pending',
            name: opponent?.nickname ?? 'In attesa',
            score: input.opponentScore,
            roundValueTotal: opponent ? getRoundValueTotal(snapshot, opponent.slot) : null,
            avatarUrl: GAME_SELECTION_ASSETS.opponentAvatar,
            status: resolvePlayerStatus(opponentHasSubmitted, opponent?.connected ?? false),
        },
        round: {
            current: snapshot.game.current_round,
            total: TOTAL_ROUNDS,
        },
        roundEvent: mapRoundEvent(snapshot.currentRoundEvent!, true),
        nextRoundEvent: snapshot.nextRoundEvent
            ? mapRoundEvent(snapshot.nextRoundEvent, true)
            : null,
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
