import { TRAIT_LABELS, TRAITS } from '../../../game/config'
import { COMBAT_MUTATION_CATALOG, NATURAL_ADVANTAGE, RULE_VERSION } from '../../../../shared/game-rules/catalog.ts'
import type { CombatMutationId, CombatMutationState } from '../../../../shared/game-rules/types.ts'
import { getCombatMutationEvolvePreview, getCombatMutationUsePreview, isTraitEvolvable, isTraitUsable } from '../../../game/engine'
import { getRoundEventEffectsForTrait } from '../../../game/round-events'
import { getValidatedActionBreakdown, getValidatedTraitUseBreakdown } from '../../../game/scoring'
import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import { getRoundEventLabel } from '../../../game/ui-context'
import type { RoundEventDefinition, TraitCollection, TraitType } from '../../../game/types'
import type { GameSnapshot, PlayerRecord } from '../../../lib/game-api'
import { resolveCreatureHeightMeters } from '../../../../shared/creature-scale.ts'
import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    GAME_SELECTION_ASSETS,
    type CreatureVisual,
    getEventAssetByArtKey,
    getGeneAssetByTrait,
} from './gene-selection-assets'
import type {
    CombatMutationSlotV2,
    DuelPlayerStatusV2,
    GeneActionTypeV2,
    GeneAffinityV2,
    GeneCardV2,
    RoundEventEffectV2,
    GeneSelectionStatusV2,
    GeneSelectionViewModelV2,
} from './types'
import { buildBattleParticipants } from './battle-participants'

type BuildGeneSelectionV2ViewModelInput = {
    snapshot: GameSnapshot
    myScore: number
    opponentScore: number
    selectedGeneId: string | null
    selectedAction: GeneActionTypeV2 | null
    isSubmitting: boolean
    submitErrorMessage: string | null
    hasLocalSubmittedAction: boolean
    localSubmittedAction: { trait: TraitType; actionType: GeneActionTypeV2 } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'SYMBIOSIS'; sourceTrait: TraitType; targetTrait: TraitType } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'FINE_DEL_MONDO' } | null
}

function mapAffinity(score: number): GeneAffinityV2 {
    return score === 2 ? 'ideal' : score === 1 ? 'suitable' : 'unfavorable'
}

function buildBattleCreatureVisual(defaultVisual: CreatureVisual, player: PlayerRecord | null | undefined): CreatureVisual {
    const snapshot = player?.creature_snapshot

    return {
        ...defaultVisual,
        heightMeters: resolveCreatureHeightMeters(snapshot?.heightMeters, snapshot?.baseCreatureKey),
    }
}

function validateTraits(traits: TraitCollection | null | undefined): boolean {
    if (!traits) {
        return false
    }

    return TRAITS.every((trait) => {
        const state = traits[trait]

        return state && typeof state.level === 'number' && typeof state.exhausted === 'boolean'
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

function getCombatMutationVisualState(id: CombatMutationId, state: CombatMutationState, hasSymbiosisLink: boolean, hasFineDelMondoActivation: boolean): CombatMutationSlotV2['status'] {
    switch (id) {
        case 'ELASTIC_LIMBS':
            return state.elasticLimbsUsed ? 'consumed' : 'available'
        case 'ADAPTIVE_CORE':
            return state.adaptiveCoreStatus === 'ARMED'
                ? 'armed'
                : state.adaptiveCoreStatus === 'CONSUMED'
                    ? 'consumed'
                    : 'available'
        case 'ARMORED_MEMORY':
            return state.armoredMemoryUsed ? 'consumed' : 'available'
        case 'RECOVERY_SURGE':
            return state.recoverySurgeUsed ? 'consumed' : 'available'
        case 'SYMBIOSIS':
            return hasSymbiosisLink ? 'linked' : 'available'
        case 'FINE_DEL_MONDO':
            return hasFineDelMondoActivation ? 'consumed' : 'available'
    }
}

function buildCombatMutationSlots(loadout: readonly CombatMutationId[], state: CombatMutationState, playerId: string, links: GameSnapshot['game']['symbiosis_links'], fineDelMondoActivations: GameSnapshot['game']['fine_del_mondo_activations']): CombatMutationSlotV2[] {
    return loadout.map((id) => {
        const mutation = COMBAT_MUTATION_CATALOG[id]
        const link = links.find((candidate) => candidate.ownerPlayerId === playerId)

        return {
            id,
            label: mutation.label,
            shortDescription: mutation.shortDescription,
            iconKey: mutation.iconKey,
            status: getCombatMutationVisualState(id, state, Boolean(link), fineDelMondoActivations.some((activation) => activation.ownerPlayerId === playerId)),
            linkLabel: id === 'SYMBIOSIS' && link ? `${TRAIT_LABELS[link.sourceTrait]} ↔ ${TRAIT_LABELS[link.targetTrait]}` : undefined,
        }
    })
}

export function buildRoundEventEffects(roundEvent: RoundEventDefinition, includeAll = false): RoundEventEffectV2[] {
    const effects = [...roundEvent.effects].filter((effect) => Number.isFinite(effect.modifier))
    if (includeAll) {
        return effects
            .sort((a, b) => (
                // Keep affinities in the fixed ideal, suitable, unfavorable order.
                (Number(b.modifier > 0) - Number(a.modifier > 0))
                || (a.modifier > 0 ? b.modifier - a.modifier : a.modifier - b.modifier)
                || TRAIT_LABELS[a.trait].localeCompare(TRAIT_LABELS[b.trait], 'it')
            ))
            .map((effect) => ({
                id: `${roundEvent.id}-${effect.trait}-${effect.modifier}`,
                trait: effect.trait,
                label: TRAIT_LABELS[effect.trait],
                modifier: effect.modifier,
                value: `${mapAffinity(effect.modifier) === 'ideal' ? 'Ideale' : mapAffinity(effect.modifier) === 'suitable' ? 'Adatto' : 'Sfavorevole'} · ${TRAIT_LABELS[effect.trait]}`,
                tone: effect.modifier === 2 ? 'positive' : effect.modifier === 1 ? 'neutral' : 'negative',
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
            trait: positive.trait,
            label: TRAIT_LABELS[positive.trait],
            modifier: positive.modifier,
            value: `+${positive.modifier} ${TRAIT_LABELS[positive.trait]}`,
            tone: 'positive',
        })
    }

    if (negative) {
        picked.push({
            id: `${roundEvent.id}-${negative.trait}-neg`,
            trait: negative.trait,
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

function buildGenes(snapshot: GameSnapshot): GeneCardV2[] {
    const roundEvent = snapshot.currentRoundEvent
    const me = snapshot.me
    const myTraits = me?.traits

    if (!myTraits || !me) {
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
            const evolvable = isTraitEvolvable(myTraits, traitType)
            const weakAgainst = TRAITS.find((candidate) => NATURAL_ADVANTAGE[candidate] === traitType)!
            const combatMutationPreview = getCombatMutationUsePreview(me.combat_mutation_state, traitType, me.combat_mutation_loadout)
            const evolveMutationPreview = getCombatMutationEvolvePreview(me.combat_mutation_state, myTraits, traitType, me.combat_mutation_loadout)
            const prediction = roundEvent
                ? getValidatedTraitUseBreakdown(roundEvent, myTraits, traitType, 0, combatMutationPreview.mutationBonus)
                : null
            const mutationHints = [
                ...(combatMutationPreview.elasticLimbsWillPreserveAgility && !state.exhausted ? ['Agilità resta disponibile'] : []),
                ...(combatMutationPreview.armoredMemoryWillPreserveArmor && !state.exhausted ? ['Corazza resta disponibile'] : []),
                ...(combatMutationPreview.mutationBonus ? ['+1 Nucleo adattivo'] : []),
            ]
            const evolveMutationHints = [
                ...(evolveMutationPreview.mutationBonus ? ['+1 Impulso di recupero'] : []),
                ...(evolveMutationPreview.adaptiveCoreWillArm ? ['+1 al prossimo USA'] : []),
            ]

            return {
                id: traitType,
                traitType,
                name: TRAIT_LABELS[traitType],
                level: state.level,
                affinity: mapAffinity(affinity),
                imageUrl: getGeneAssetByTrait(traitType),
                usable,
                evolvable,
                exhausted: state.exhausted,
                strongAgainst: TRAIT_LABELS[NATURAL_ADVANTAGE[traitType]],
                weakAgainst: TRAIT_LABELS[weakAgainst],
                strongAgainstTrait: NATURAL_ADVANTAGE[traitType],
                weakAgainstTrait: weakAgainst,
                disabledReason: usable ? undefined : 'Esaurito: rigeneralo con EVOLVI',
                prediction: prediction
                    ? {
                        useScore: prediction.total,
                        baseContribution: prediction.baseContribution,
                        levelContribution: prediction.levelContribution,
                        eventModifier: prediction.eventModifier,
                        mutationBonus: prediction.mutationBonus,
                        reasons: prediction.appliedEventEffects.map((effect) => effect.reason),
                    }
                    : undefined,
                mutationHints: mutationHints.length ? mutationHints : undefined,
                evolvePrediction: roundEvent
                    ? { score: getValidatedActionBreakdown(roundEvent, myTraits, traitType, 'EVOLVE', 0, evolveMutationPreview.mutationBonus).total, mutationBonus: evolveMutationPreview.mutationBonus || undefined }
                    : undefined,
                evolveMutationHints: evolveMutationHints.length ? evolveMutationHints : undefined,
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

export function getInitialTraitIdForSnapshot(snapshot: GameSnapshot): TraitType | null {
    return buildGenes(snapshot).sort((left, right) => TRAIT_CATALOG[left.traitType].displayOrder - TRAIT_CATALOG[right.traitType].displayOrder)[0]?.traitType ?? null
}

export function buildGeneSelectionV2ViewModel(input: BuildGeneSelectionV2ViewModelInput): GeneSelectionViewModelV2 {
    const { snapshot } = input
    const { localPlayer: me, remotePlayer: opponent } = buildBattleParticipants(snapshot.players, snapshot.me?.id)
    const isVsBot = snapshot.game.game_mode === 'VS_BOT'
    const playability = isSnapshotPlayable(snapshot)
    const genes = buildGenes(snapshot)
    const symbiosisLinks = snapshot.game.symbiosis_links ?? []
    const fineDelMondoActivations = snapshot.game.fine_del_mondo_activations ?? []
    const selectedGene = resolveSelectedGene(genes, input.selectedGeneId)
    const selectedGeneId = selectedGene?.id ?? null
    const myHasSubmitted = Boolean(snapshot.myCurrentAction) || input.hasLocalSubmittedAction
    const opponentHasSubmitted = resolveOpponentSubmitted(snapshot)

    if (!playability.valid || !me) {
        return {
            player: {
                id: 'unknown',
                name: 'Tu',
                score: 0,
                roundValueTotal: null,
                avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
                creatureVisual: buildBattleCreatureVisual(DEFAULT_BATTLE_PLAYER_CREATURE, me),
                combatMutations: [],
                status: 'choosing',
            },
            opponent: {
                id: 'unknown-opponent',
                name: 'Avversario',
                score: 0,
                roundValueTotal: null,
                avatarUrl: GAME_SELECTION_ASSETS.opponentAvatar,
                creatureVisual: buildBattleCreatureVisual(DEFAULT_BATTLE_OPPONENT_CREATURE, opponent),
                combatMutations: [],
                status: 'choosing',
            },
            round: {
                current: snapshot.game.current_round,
                total: snapshot.game.scheduled_rounds,
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
            canActivateSymbiosis: false,
            canActivateFineDelMondo: false,
            symbiosisTargets: [],
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
    const canEvolve = Boolean(selectedGene?.evolvable) && (status === 'choosing' || status === 'error')
    const canUse = Boolean(selectedGene?.usable) && (status === 'choosing' || status === 'error')
    const canActivateSymbiosis = Boolean(
        snapshot.me?.combat_mutation_loadout.includes('SYMBIOSIS')
        && !symbiosisLinks.some((link) => link.ownerPlayerId === snapshot.me?.id)
        && snapshot.game.rule_version === RULE_VERSION
        && opponent,
    ) && (status === 'choosing' || status === 'error')
    const canActivateFineDelMondo = Boolean(
        snapshot.me?.combat_mutation_loadout.includes('FINE_DEL_MONDO')
        && !fineDelMondoActivations.some((activation) => activation.ownerPlayerId === snapshot.me?.id)
        && snapshot.game.rule_version === RULE_VERSION
        && snapshot.game.current_round >= 3
        && snapshot.game.current_round <= snapshot.game.scheduled_rounds - 2,
    ) && (status === 'choosing' || status === 'error')

    const submittedAction = snapshot.myCurrentAction
        ? snapshot.myCurrentAction.action_type === 'ACTIVATE_MUTATION'
            ? snapshot.myCurrentAction.mutation_id === 'FINE_DEL_MONDO'
                ? { actionType: 'ACTIVATE_MUTATION' as const, mutationId: 'FINE_DEL_MONDO' as const }
                : { actionType: 'ACTIVATE_MUTATION' as const, mutationId: 'SYMBIOSIS' as const, sourceTrait: snapshot.myCurrentAction.trait, targetTrait: snapshot.myCurrentAction.target_trait }
            : { trait: snapshot.myCurrentAction.trait, actionType: snapshot.myCurrentAction.action_type }
        : input.localSubmittedAction

    const submittedGene = submittedAction && submittedAction.actionType !== 'ACTIVATE_MUTATION' ? genes.find((gene) => gene.traitType === submittedAction.trait) : selectedGene
    const submittedGeneName = submittedAction?.actionType === 'ACTIVATE_MUTATION'
        ? submittedAction.mutationId === 'FINE_DEL_MONDO'
            ? 'Fine del mondo'
            : `${TRAIT_LABELS[submittedAction.sourceTrait]} ↔ ${TRAIT_LABELS[submittedAction.targetTrait]}`
        : submittedGene?.name

    return {
        player: {
            id: me.id,
            name: me.nickname,
            score: input.myScore,
            roundValueTotal: getRoundValueTotal(snapshot, me.slot),
            avatarUrl: GAME_SELECTION_ASSETS.playerAvatar,
            creatureVisual: buildBattleCreatureVisual(DEFAULT_BATTLE_PLAYER_CREATURE, me),
            combatMutations: buildCombatMutationSlots(me.combat_mutation_loadout, me.combat_mutation_state, me.id, symbiosisLinks, fineDelMondoActivations),
            status: resolvePlayerStatus(myHasSubmitted, me.connected),
        },
        opponent: {
            id: opponent?.id ?? 'opponent-pending',
            name: opponent?.nickname ?? 'In attesa',
            score: input.opponentScore,
            roundValueTotal: opponent ? getRoundValueTotal(snapshot, opponent.slot) : null,
            avatarUrl: GAME_SELECTION_ASSETS.opponentAvatar,
            creatureVisual: buildBattleCreatureVisual(DEFAULT_BATTLE_OPPONENT_CREATURE, opponent),
            combatMutations: opponent
                ? buildCombatMutationSlots(opponent.combat_mutation_loadout, opponent.combat_mutation_state, opponent.id, symbiosisLinks, fineDelMondoActivations)
                : [],
            status: resolvePlayerStatus(opponentHasSubmitted, opponent?.connected ?? false),
        },
        round: {
            current: snapshot.game.current_round,
            total: snapshot.game.scheduled_rounds,
        },
        roundEvent: mapRoundEvent(snapshot.currentRoundEvent!, true),
        nextRoundEvent: snapshot.nextRoundEvent
            ? mapRoundEvent(snapshot.nextRoundEvent, true)
            : null,
        genes,
        selectedGeneId,
        selectedAction: submittedAction?.actionType === 'ACTIVATE_MUTATION' ? null : submittedAction?.actionType ?? input.selectedAction,
        selectedGene,
        status,
        actionsSubmitted: snapshot.actionsSubmitted,
        canUse,
        canEvolve,
        canActivateSymbiosis,
        canActivateFineDelMondo,
        symbiosisTargets: opponent ? TRAITS.map((trait) => ({ id: trait, name: TRAIT_LABELS[trait] })) : [],
        canSelectGenes,
        errorMessage: input.submitErrorMessage ?? undefined,
        waitingState: submittedAction && submittedGeneName
            ? {
                submittedGeneName,
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
