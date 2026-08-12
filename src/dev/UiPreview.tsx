import { useState } from 'react'

import { HomeScreen } from '../screens/home/HomeScreen'
import { BattleScreen } from '../screens/battle/BattleScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { CollectionScreen } from '../screens/collection/CollectionScreen'
import { LeaderboardScreen } from '../screens/ranking/LeaderboardScreen'
import { CreatureVisualProgressionScreen } from '../components/creature-visual-progression/CreatureVisualProgressionScreen'
import { CreatureTransformationLab } from '../components/creature-transformation-lab/CreatureTransformationLab'
import { EvolutionDraftOverlay } from '../screens/battle/parts/EvolutionDraftOverlay'
import type { UiPreviewRoute } from './uiPreviewRoute'
import {
    PREVIEW_CREATURE,
    PREVIEW_GENES,
    PREVIEW_HISTORY,
    PREVIEW_LEADERBOARD,
    PREVIEW_PROFILE,
    PREVIEW_VISUAL_HISTORY,
    buildPreviewBattleViewModel,
    buildPreviewHomeViewModel,
} from './uiPreviewFixtures'

const noop = () => undefined
const asyncNoop = async () => undefined

function HomePreview() {
    return (
                <HomeScreen
                    viewModel={buildPreviewHomeViewModel()}
                    actions={{
                        onNicknameChange: noop,
                        onRoomCodeChange: noop,
                        onBotDifficultyChange: noop,
                        onCreateGame: noop,
                        onCreateBotGame: noop,
                        onJoinGame: noop,
                        onLeaveSession: noop,
                        onOpenProfile: noop,
                        onOpenCollection: noop,
                        onOpenRanking: noop,
                        onLogout: noop,
                    }}
                />
    )
}

function RankingPreview() {
    return <LeaderboardScreen onBack={noop} onOpenProfile={noop} onLogout={noop} previewEntries={PREVIEW_LEADERBOARD} />
}

function BattlePreview() {
    const [selectedGeneId, setSelectedGeneId] = useState(PREVIEW_GENES[2]!.id)

    return (
        <BattleScreen
            viewModel={buildPreviewBattleViewModel(selectedGeneId)}
            onSelectGene={setSelectedGeneId}
            onUseGene={asyncNoop}
            onEvolveGene={asyncNoop}
            onLeaveSession={noop}
        />
    )
}

function ProfilePreview() {
    return (
                <ProfileScreen
                    profile={PREVIEW_PROFILE}
                    creature={PREVIEW_CREATURE}
                    history={PREVIEW_HISTORY}
                    isLoadingHistory={false}
                    errorMessage={null}
                    onBack={noop}
                    onLogout={noop}
                    visualUrl={PREVIEW_VISUAL_HISTORY[2].signedUrl}
                    visualVersionNumber={3}
                    visualTrait="Arti slanciati"
                    visualProgress={{ progress: 2, target: 3, status: 'IN_PROGRESS' }}
                    visualHistory={PREVIEW_VISUAL_HISTORY}
                    currentVisualVersionId="preview-visual-3"
                    onSelectVisualVersion={async () => undefined}
                    onOpenEvolution={noop}
                    onOpenBackgroundCleanup={noop}
                />
    )
}

function CollectionPreview() {
    return (
        <CollectionScreen
            profile={PREVIEW_PROFILE}
            creature={PREVIEW_CREATURE}
            isOnline
            onBack={noop}
            onOpenProfile={noop}
            onOpenRanking={noop}
            onLogout={noop}
            visualUrl={PREVIEW_VISUAL_HISTORY[8].signedUrl}
            visualVersionNumber={9}
            visualTrait="SENSES"
            visualHistory={PREVIEW_VISUAL_HISTORY}
            currentVisualVersionId="preview-visual-9"
        />
    )
}

function DraftPreview() {
    const [chosen, setChosen] = useState<string | null>(null)

    return (
        <>
            <BattlePreview />
            {chosen ? null : (
                <EvolutionDraftOverlay
                    options={['TAIL', 'HEAD_AND_SENSES']}
                    creatureId={PREVIEW_CREATURE.id}
                    onChoose={async (targetId) => { setChosen(targetId) }}
                />
            )}
        </>
    )
}

function EvolutionPreview() {
    return (
        <CreatureVisualProgressionScreen
            creature={PREVIEW_CREATURE}
            onBack={noop}
            onVisualChanged={asyncNoop}
        />
    )
}

/**
 * The lab talks to the transformation API on mount. Without a session those calls fail, which is
 * fine for design iteration: the panels, controls and the error state all render.
 */
function LabPreview() {
    return <CreatureTransformationLab creature={PREVIEW_CREATURE} onBack={noop} />
}

/** Development-only rendering of the product screens, used for design iteration. */
export function UiPreview({ route }: { route: UiPreviewRoute }) {
    if (route === 'battle') {
        return <BattlePreview />
    }

    if (route === 'profile') {
        return <ProfilePreview />
    }

    if (route === 'collection') {
        return <CollectionPreview />
    }

    if (route === 'ranking') {
        return <RankingPreview />
    }

    if (route === 'evolution') {
        return <EvolutionPreview />
    }

    if (route === 'draft') {
        return <DraftPreview />
    }

    if (route === 'lab') {
        return <LabPreview />
    }

    return <HomePreview />
}
