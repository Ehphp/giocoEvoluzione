import { useMemo, useState } from 'react'

import { GAME_SELECTION_ASSETS } from './gameSelectionAssets'
import { geneSelectionMockDataV2 } from './mockData'
import { ActionPanelV2 } from './components/ActionPanelV2'
import { CreatureStageV2 } from './components/CreatureStageV2'
import { DuelHeaderV2 } from './components/DuelHeaderV2'
import { EnvironmentPanelV2 } from './components/EnvironmentPanelV2'
import { GeneSelectorPreviewV2 } from './components/GeneSelectorPreviewV2'
import { RoundIndicatorV2 } from './components/RoundIndicatorV2'
import { SelectedGeneDetailsV2 } from './components/SelectedGeneDetailsV2'

import './GeneSelectionScreenV2.css'

export function GeneSelectionScreenV2() {
    const [selectedGeneId, setSelectedGeneId] = useState(geneSelectionMockDataV2.selectedGeneId)
    const [selectedAction, setSelectedAction] = useState<'USE' | 'EVOLVE' | null>(geneSelectionMockDataV2.selectedAction)

    const selectedGene = useMemo(() => {
        return geneSelectionMockDataV2.genes.find((gene) => gene.id === selectedGeneId) ?? geneSelectionMockDataV2.genes[0]
    }, [selectedGeneId])

    if (!selectedGene) {
        return null
    }

    return (
        <section className="gene-v2-screen" aria-label="Nuova schermata scelta gene V2">
            <div className="gene-v2-background" aria-hidden="true">
                <img src={GAME_SELECTION_ASSETS.background} alt="" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
            </div>

            <div className="gene-v2-scroll">
                <DuelHeaderV2 player={geneSelectionMockDataV2.player} opponent={geneSelectionMockDataV2.opponent} />
                <RoundIndicatorV2 round={geneSelectionMockDataV2.round} />
                <EnvironmentPanelV2 environment={geneSelectionMockDataV2.environment} />
                <CreatureStageV2
                    playerName={geneSelectionMockDataV2.player.name}
                    opponentName={geneSelectionMockDataV2.opponent.name}
                    playerCreatureUrl={GAME_SELECTION_ASSETS.playerCreature}
                    opponentCreatureUrl={GAME_SELECTION_ASSETS.opponentCreature}
                />
                <GeneSelectorPreviewV2
                    genes={geneSelectionMockDataV2.genes}
                    selectedGeneId={selectedGeneId}
                    onSelectGene={setSelectedGeneId}
                />
                <SelectedGeneDetailsV2 gene={selectedGene} />
                <ActionPanelV2 selectedAction={selectedAction} onActionSelect={setSelectedAction} />
            </div>
        </section>
    )
}
