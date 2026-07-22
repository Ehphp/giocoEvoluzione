import { TOTAL_ROUNDS, TRAIT_LABELS, ENVIRONMENT_MODIFIERS } from '../../../game/config'
import { getTraitRoundValue, isTraitUsable } from '../../../game/engine'
import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import { getBiomeLabel } from '../../../game/ui-context'
import type { Environment } from '../../../game/types'
import type { TraitType } from '../../../game/types'
import type { GameSnapshot } from '../../../lib/game-api'
import { GAME_SELECTION_ASSETS, getEnvironmentAsset, getGeneAssetByTrait } from '../gameSelectionAssets'
import type {
    DuelPlayerStatusV2,
    EnvironmentModifierV2,
    GeneActionTypeV2,
    GeneAffinityV2,
    GeneCardV2,
    GeneSelectionStatusV2,
    GeneSelectionViewModelV2,
} from '../types'

const ENVIRONMENT_DESCRIPTIONS: Record<Environment, string> = {
    FOREST: 'Vegetazione densa e linee visive irregolari: conta leggere il terreno e muoversi con precisione.',
    MOUNTAIN: 'Clima duro e terreno instabile: sopravvivenza e controllo del corpo diventano centrali.',
    SWAMP: 'Ambiente umido e stagnante: risorse sporche e movimenti lenti premiano geni resilienti.',
}

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
    if (score >= 3) {
        return 'excellent'
    }

    if (score >= 2) {
        return 'high'
    }

    if (score >= 1) {
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

function buildEnvironmentModifiers(environment: NonNullable<GameSnapshot['currentEnvironment']>): EnvironmentModifierV2[] {
    const traitModifiers = ENVIRONMENT_MODIFIERS[environment]
    const sorted = (Object.entries(traitModifiers) as Array<[TraitType, number]>).sort((a, b) => b[1] - a[1])
    const strongest = sorted.slice(0, 2)
    const weakest = sorted.slice(-1)
    const highlighted = [...strongest, ...weakest]

    return highlighted.map(([trait, value], index) => {
        const tone = value > 1 ? 'positive' : value < 1 ? 'negative' : 'neutral'
        const signedValue = value >= 0 ? `+${value}` : `${value}`

        return {
            id: `${trait}-${index}`,
            label: TRAIT_LABELS[trait],
            value: `${signedValue} ${TRAIT_LABELS[trait]}`,
            tone,
        }
    })
}

function buildGenes(snapshot: GameSnapshot): GeneCardV2[] {
    const environment = snapshot.currentEnvironment
    const myTraits = snapshot.me?.traits

    if (!environment || !myTraits) {
        return []
    }

    return (Object.keys(myTraits) as TraitType[])
        .sort((a, b) => TRAIT_CATALOG[a].displayOrder - TRAIT_CATALOG[b].displayOrder)
        .map((traitType) => {
            const state = myTraits[traitType]
            const affinity = ENVIRONMENT_MODIFIERS[environment][traitType]
            const usable = isTraitUsable(myTraits, traitType)

            return {
                id: traitType,
                traitType,
                name: TRAIT_LABELS[traitType],
                level: state.level,
                affinity: mapAffinity(affinity),
                imageUrl: getGeneAssetByTrait(traitType),
                description: TRAIT_CATALOG[traitType].description,
                predictedValue: getTraitRoundValue(environment, myTraits, traitType),
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
            environment: {
                id: 'unknown-env',
                name: 'Ambiente non disponibile',
                description: 'Dati ambiente non disponibili.',
                imageUrl: GAME_SELECTION_ASSETS.environment,
                modifiers: [],
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
    const environment = snapshot.currentEnvironment
    const genes = buildGenes(snapshot)
    const selectedGene = resolveSelectedGene(genes, input.selectedGeneId)
    const selectedGeneId = selectedGene?.id ?? null
    const myHasSubmitted = Boolean(snapshot.myCurrentAction) || input.hasLocalSubmittedAction
    const opponentHasSubmitted = resolveOpponentSubmitted(snapshot)

    let status: GeneSelectionStatusV2 = 'choosing'

    if (!environment) {
        status = 'loading'
    } else if (input.submitErrorMessage) {
        status = 'error'
    } else if (input.isSubmitting) {
        status = 'submitting'
    } else if (myHasSubmitted && snapshot.actionsSubmitted >= 2) {
        status = 'resolving'
    } else if (myHasSubmitted) {
        status = 'waiting'
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
        environment: {
            id: environment ?? 'unknown-env',
            name: getBiomeLabel(environment),
            description: environment ? ENVIRONMENT_DESCRIPTIONS[environment] : 'Ambiente in caricamento.',
            imageUrl: environment ? getEnvironmentAsset(environment) : GAME_SELECTION_ASSETS.environment,
            modifiers: environment ? buildEnvironmentModifiers(environment) : [],
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
                submittedCountLabel: `${Math.min(snapshot.actionsSubmitted, 2)}/2`,
                opponentStatusLabel: opponentHasSubmitted ? 'Scelta avversario ricevuta' : 'In attesa dell avversario',
                isResolving: snapshot.actionsSubmitted >= 2,
            }
            : undefined,
    }
}

export type { BuildGeneSelectionV2ViewModelInput }