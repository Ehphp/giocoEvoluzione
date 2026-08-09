import { useState } from 'react'

import { HomeScreen } from '../screens/home/HomeScreen'
import { BattleScreen } from '../screens/battle/BattleScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { CreatureVisualProgressionScreen } from '../components/creature-visual-progression/CreatureVisualProgressionScreen'
import type { UiPreviewRoute } from './uiPreviewRoute'
import {
    PREVIEW_CREATURE,
    PREVIEW_GENES,
    PREVIEW_HISTORY,
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
                        onLogout: noop,
                    }}
                />
    )
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

function EvolutionPreview() {
    return (
        <CreatureVisualProgressionScreen
            creature={PREVIEW_CREATURE}
            onBack={noop}
            onVisualChanged={asyncNoop}
        />
    )
}

/** Development-only rendering of the product screens, used for design iteration. */
export function UiPreview({ route }: { route: UiPreviewRoute }) {
    if (route === 'battle') {
        return <BattlePreview />
    }

    if (route === 'profile') {
        return <ProfilePreview />
    }

    if (route === 'evolution') {
        return <EvolutionPreview />
    }

    return <HomePreview />
}
