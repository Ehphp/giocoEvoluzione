import { useState } from 'react'

import { HomeScreen } from '../screens/home/HomeScreen'
import { BattleScreen } from '../screens/battle/BattleScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { CollectionScreen } from '../screens/collection/CollectionScreen'
import { LeaderboardScreen } from '../screens/ranking/LeaderboardScreen'
import { CreatureVisualProgressionScreen } from '../components/creature-visual-progression/CreatureVisualProgressionScreen'
import { EvolutionDraftOverlay } from '../screens/battle/parts/EvolutionDraftOverlay'
import { ScreenTransition } from '../ui/ScreenTransition'
import { Button } from '../ui/components'
import { SCREEN_DEPTH, type ScreenId } from '../app/screen-depth'
import type { UiPreviewRoute } from './ui-preview-route'
import {
    PREVIEW_CREATURE,
    PREVIEW_GENES,
    PREVIEW_HISTORY,
    PREVIEW_LEADERBOARD,
    PREVIEW_PROFILE,
    PREVIEW_VISUAL_HISTORY,
    buildPreviewBattleViewModel,
    buildPreviewHomeViewModel,
} from './ui-preview-fixtures'

import './ui-preview.css'

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
    return <LeaderboardScreen onBack={noop} onOpenCollection={noop} onOpenProfile={noop} onLogout={noop} previewEntries={PREVIEW_LEADERBOARD} />
}

function BattlePreview() {
    const [selectedGeneId, setSelectedGeneId] = useState(PREVIEW_GENES[2]!.id)

    return (
        <BattleScreen
            viewModel={buildPreviewBattleViewModel(selectedGeneId)}
            onSelectGene={setSelectedGeneId}
            onUseGene={asyncNoop}
            onEvolveGene={asyncNoop}
            onActivateSymbiosis={async () => false}
            onActivateFineDelMondo={async () => false}
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
            onOpenCollection={noop}
            onOpenRanking={noop}
            onLogout={noop}
            visualUrl={PREVIEW_VISUAL_HISTORY[2].signedUrl}
            visualVersionNumber={3}
            visualTrait="Arti slanciati"
            onOpenEvolution={noop}
        />
    )
}

function CollectionPreview() {
    const secondCreature = {
        ...PREVIEW_CREATURE,
        id: 'preview-creature-2',
        lineage_id: 'preview-lineage-2',
        name: 'Canopia',
        current_visual_version_id: undefined,
    }

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
            lineages={[
                { id: 'preview-lineage', profile_id: PREVIEW_PROFILE.id, name: 'Stirpe Verdello', base_creature_key: PREVIEW_CREATURE.base_creature_key, created_at: PREVIEW_CREATURE.created_at, updated_at: PREVIEW_CREATURE.updated_at, creature: PREVIEW_CREATURE },
                { id: 'preview-lineage-2', profile_id: PREVIEW_PROFILE.id, name: 'Stirpe della Canopia', base_creature_key: secondCreature.base_creature_key, created_at: secondCreature.created_at, updated_at: secondCreature.updated_at, creature: secondCreature },
            ]}
            activeLineageId="preview-lineage"
            onDeleteLineage={asyncNoop}
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
                    options={['TAIL', 'HEAD_AND_CROWN']}
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

const TRANSITION_STOPS = [
    { id: 'home', label: 'Home', render: () => <HomePreview /> },
    { id: 'collection', label: 'Collezione', render: () => <CollectionPreview /> },
    { id: 'profile', label: 'Creatura', render: () => <ProfilePreview /> },
    { id: 'ranking', label: 'Classifica', render: () => <RankingPreview /> },
    { id: 'creature-evolution', label: 'Evoluzione', render: () => <EvolutionPreview /> },
    { id: 'battle', label: 'Battaglia', render: () => <BattlePreview /> },
] as const satisfies ReadonlyArray<{ id: ScreenId; label: string; render: () => React.JSX.Element }>

/**
 * The motion layer on its own.
 *
 * The real transitions all sit behind authentication, so this is the only place the three moves can
 * be watched side by side: cross-fade between the dock's destinations, push into the evolution
 * screen or a battle, pop back out.
 */
function TransitionsPreview() {
    const [stopId, setStopId] = useState<ScreenId>('home')
    const stop = TRANSITION_STOPS.find((candidate) => candidate.id === stopId) ?? TRANSITION_STOPS[0]

    return (
        <>
            <ScreenTransition screenKey={stop.id} depth={SCREEN_DEPTH[stop.id]}>
                {stop.render()}
            </ScreenTransition>
            <nav className="ev-preview-moves" aria-label="Anteprima transizioni">
                {TRANSITION_STOPS.map((candidate) => (
                    <Button
                        key={candidate.id}
                        tone={candidate.id === stopId ? 'gold' : 'cream'}
                        size="sm"
                        onClick={() => setStopId(candidate.id)}
                    >
                        {`${candidate.label} · ${SCREEN_DEPTH[candidate.id]}`}
                    </Button>
                ))}
            </nav>
        </>
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

    if (route === 'transitions') {
        return <TransitionsPreview />
    }

    return <HomePreview />
}
