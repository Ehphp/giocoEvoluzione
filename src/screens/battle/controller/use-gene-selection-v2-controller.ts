import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { TraitType } from '../../../game/types'
import type { GameSnapshot } from '../../../lib/game-api'
import type { GeneActionCommandV2, GeneActionTypeV2 } from './types'
import { buildGeneSelectionV2ViewModel, getInitialTraitIdForSnapshot } from './build-gene-selection-v2-view-model'

type UseGeneSelectionV2ControllerInput = {
    snapshot: GameSnapshot
    myScore: number
    opponentScore: number
    onSubmitAction: (action: { trait: TraitType; actionType: GeneActionTypeV2 } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'SYMBIOSIS'; sourceTrait: TraitType; targetTrait: TraitType } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'FINE_DEL_MONDO' }) => Promise<boolean>
}
type LocalSubmittedAction = { trait: TraitType; actionType: GeneActionTypeV2 } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'SYMBIOSIS'; sourceTrait: TraitType; targetTrait: TraitType } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'FINE_DEL_MONDO' }

function getInitialTraitId(snapshot: GameSnapshot): string | null {
    return getInitialTraitIdForSnapshot(snapshot)
}

export function useGeneSelectionV2Controller(input: UseGeneSelectionV2ControllerInput) {
    const [selectedGeneId, setSelectedGeneId] = useState<string | null>(() => getInitialTraitId(input.snapshot))
    const [selectedAction, setSelectedAction] = useState<GeneActionTypeV2 | null>(null)
    const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [localSubmittedAction, setLocalSubmittedAction] = useState<LocalSubmittedAction | null>(null)
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

        if (myCurrentAction?.trait && !selectedGeneId) {
            setSelectedGeneId(myCurrentAction.trait)

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
        if (submittingRef.current || viewModel.status === 'loading' || viewModel.status === 'invalid') {
            return
        }

        if (!viewModel.genes.some((gene) => gene.id === geneId)) {
            return
        }

        setSelectedGeneId(geneId)
        setSelectedAction(null)
        setSubmitErrorMessage(null)
    }, [viewModel.genes, viewModel.status])

    const handleSubmitGeneAction = useCallback(async ({ geneId, actionType }: GeneActionCommandV2): Promise<boolean> => {
        const gene = viewModel.genes.find((candidate) => candidate.id === geneId)
        const canChoose = viewModel.status === 'choosing' || viewModel.status === 'error'

        if (submittingRef.current || !gene || !canChoose) {
            return false
        }

        if (actionType === 'USE' && !gene.usable) {
            return false
        }

        if (actionType === 'EVOLVE' && !gene.evolvable) {
            return false
        }

        submittingRef.current = true
        setIsSubmitting(true)
        setSelectedAction(actionType)
        setSubmitErrorMessage(null)

        const trait = gene.traitType
        let submitted = false

        try {
            submitted = await input.onSubmitAction({ trait, actionType })
        } catch {
            submitted = false
        }

        setIsSubmitting(false)
        submittingRef.current = false

        if (submitted) {
            setLocalSubmittedAction({ trait, actionType })

            return true
        }

        setSubmitErrorMessage('Invio azione non riuscito. Riprova.')
        return false
    }, [input, viewModel.genes, viewModel.status])

    const handleUseGene = useCallback(async () => {
        const geneId = viewModel.selectedGene?.id

        if (!geneId) {
            return
        }

        await handleSubmitGeneAction({ geneId, actionType: 'USE' })
    }, [handleSubmitGeneAction, viewModel.selectedGene?.id])

    const handleEvolveGene = useCallback(async () => {
        const geneId = viewModel.selectedGene?.id

        if (!geneId) {
            return
        }

        await handleSubmitGeneAction({ geneId, actionType: 'EVOLVE' })
    }, [handleSubmitGeneAction, viewModel.selectedGene?.id])

    const handleActivateSymbiosis = useCallback(async (sourceTrait: TraitType, targetTrait: TraitType) => {
        if (submittingRef.current || !viewModel.canActivateSymbiosis || viewModel.status === 'invalid') return false
        submittingRef.current = true
        setIsSubmitting(true)
        setSubmitErrorMessage(null)
        const submitted = await input.onSubmitAction({ actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait, targetTrait })
        if (submitted) {
            setLocalSubmittedAction({ actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait, targetTrait })
            setIsSubmitting(false)
            submittingRef.current = false
            return true
        }
        setIsSubmitting(false)
        submittingRef.current = false
        setSubmitErrorMessage('Invio Simbiosi non riuscito. Riprova.')
        return false
    }, [input, viewModel.canActivateSymbiosis, viewModel.status])

    const handleActivateFineDelMondo = useCallback(async () => {
        if (submittingRef.current || !viewModel.canActivateFineDelMondo || viewModel.status === 'invalid') return false
        submittingRef.current = true
        setIsSubmitting(true)
        setSubmitErrorMessage(null)
        const submitted = await input.onSubmitAction({ actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' })
        if (submitted) {
            setLocalSubmittedAction({ actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' })
            setIsSubmitting(false)
            submittingRef.current = false
            return true
        }
        setIsSubmitting(false)
        submittingRef.current = false
        setSubmitErrorMessage('Invio Fine del mondo non riuscito. Riprova.')
        return false
    }, [input, viewModel.canActivateFineDelMondo, viewModel.status])

    return {
        viewModel,
        onSelectGene: handleSelectGene,
        onSubmitGeneAction: handleSubmitGeneAction,
        onUseGene: handleUseGene,
        onEvolveGene: handleEvolveGene,
        onActivateSymbiosis: handleActivateSymbiosis,
        onActivateFineDelMondo: handleActivateFineDelMondo,
    }
}

export type { UseGeneSelectionV2ControllerInput }
