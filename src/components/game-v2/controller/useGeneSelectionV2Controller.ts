import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { TRAIT_CATALOG } from '../../../game/traits-catalog'
import type { TraitType } from '../../../game/types'
import type { GameSnapshot } from '../../../lib/game-api'
import type { GeneActionTypeV2 } from '../types'
import { buildGeneSelectionV2ViewModel } from './buildGeneSelectionV2ViewModel'

type UseGeneSelectionV2ControllerInput = {
    snapshot: GameSnapshot
    myScore: number
    opponentScore: number
    onSubmitAction: (trait: TraitType, actionType: GeneActionTypeV2) => Promise<boolean>
}

function getInitialTraitId(snapshot: GameSnapshot): string | null {
    const meTraits = snapshot.me?.traits

    if (!meTraits) {
        return null
    }

    const sortedTraits = (Object.keys(meTraits) as TraitType[]).sort((a, b) => TRAIT_CATALOG[a].displayOrder - TRAIT_CATALOG[b].displayOrder)

    return sortedTraits[0] ?? null
}

export function useGeneSelectionV2Controller(input: UseGeneSelectionV2ControllerInput) {
    const [selectedGeneId, setSelectedGeneId] = useState<string | null>(() => getInitialTraitId(input.snapshot))
    const [selectedAction, setSelectedAction] = useState<GeneActionTypeV2 | null>(null)
    const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [localSubmittedAction, setLocalSubmittedAction] = useState<{ trait: TraitType; actionType: GeneActionTypeV2 } | null>(null)
    const submittingRef = useRef(false)
    const previousRoundRef = useRef<number>(input.snapshot.game.current_round)
    const previousGameRef = useRef<string>(input.snapshot.game.id)

    const myCurrentAction = input.snapshot.myCurrentAction
    const myTraits = input.snapshot.me?.traits

    useEffect(() => {
        const currentGame = input.snapshot.game.id
        const currentRound = input.snapshot.game.current_round
        const status = input.snapshot.game.status
        const gameChanged = previousGameRef.current !== currentGame
        const roundChanged = previousRoundRef.current !== currentRound

        if (gameChanged || roundChanged || status !== 'CHOOSING') {
            setSelectedAction(null)
            setSubmitErrorMessage(null)
            setLocalSubmittedAction(null)
            setIsSubmitting(false)
            submittingRef.current = false
        }

        if (gameChanged || roundChanged) {
            setSelectedGeneId(getInitialTraitId(input.snapshot))
        }

        previousGameRef.current = currentGame
        previousRoundRef.current = currentRound
    }, [input.snapshot])

    useEffect(() => {
        if (!myTraits) {
            setSelectedGeneId(null)

            return
        }

        const traitIds = new Set((Object.keys(myTraits) as TraitType[]).map((trait) => trait))

        if (myCurrentAction) {
            setSelectedGeneId(null)

            return
        }

        if (!selectedGeneId || !traitIds.has(selectedGeneId as TraitType)) {
            setSelectedGeneId(getInitialTraitId(input.snapshot))
        }
    }, [input.snapshot, myCurrentAction, myTraits, selectedGeneId])

    const viewModel = useMemo(() => {
        return buildGeneSelectionV2ViewModel({
            snapshot: input.snapshot,
            myScore: input.myScore,
            opponentScore: input.opponentScore,
            selectedGeneId,
            selectedAction,
            isSubmitting,
            submitErrorMessage,
            hasLocalSubmittedAction: Boolean(localSubmittedAction),
            localSubmittedAction,
        })
    }, [input.myScore, input.opponentScore, input.snapshot, isSubmitting, localSubmittedAction, selectedAction, selectedGeneId, submitErrorMessage])

    const handleSelectGene = useCallback((geneId: string) => {
        if (!viewModel.canSelectGenes || submittingRef.current) {
            return
        }

        if (!viewModel.genes.some((gene) => gene.id === geneId)) {
            return
        }

        setSelectedGeneId(geneId)
        setSelectedAction(null)
        setSubmitErrorMessage(null)
    }, [viewModel.canSelectGenes, viewModel.genes])

    const handleSubmit = useCallback(async (actionType: GeneActionTypeV2) => {
        if (submittingRef.current || !viewModel.selectedGene) {
            return
        }

        if (actionType === 'USE' && !viewModel.canUse) {
            return
        }

        if (actionType === 'EVOLVE' && !viewModel.canEvolve) {
            return
        }

        submittingRef.current = true
        setIsSubmitting(true)
        setSelectedAction(actionType)
        setSubmitErrorMessage(null)

        const trait = viewModel.selectedGene.traitType
        const submitted = await input.onSubmitAction(trait, actionType)

        if (submitted) {
            setLocalSubmittedAction({ trait, actionType })
            setIsSubmitting(false)
            submittingRef.current = false

            return
        }

        setIsSubmitting(false)
        submittingRef.current = false
        setSubmitErrorMessage('Invio azione non riuscito. Riprova.')
    }, [input, viewModel.canEvolve, viewModel.canUse, viewModel.selectedGene])

    const handleUseGene = useCallback(async () => {
        await handleSubmit('USE')
    }, [handleSubmit])

    const handleEvolveGene = useCallback(async () => {
        await handleSubmit('EVOLVE')
    }, [handleSubmit])

    return {
        viewModel,
        onSelectGene: handleSelectGene,
        onUseGene: handleUseGene,
        onEvolveGene: handleEvolveGene,
    }
}

export type { UseGeneSelectionV2ControllerInput }