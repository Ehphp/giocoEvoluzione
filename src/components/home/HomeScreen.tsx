import './HomeScreen.css'

import { useEffect, useState } from 'react'

import { HomeBrand } from './HomeBrand'
import { HomeCreatureStage } from './HomeCreatureStage'
import { HomeNotices } from './HomeNotices'
import { HomePlayModes } from './HomePlayModes'
import { HomePrimaryNavigation } from './HomePrimaryNavigation'
import { HomeTopBar } from './HomeTopBar'
import type { HomeActions, HomeViewModel } from './types'

type HomeScreenProps = {
    viewModel: HomeViewModel
    actions: HomeActions
}

export function HomeScreen({ viewModel, actions }: HomeScreenProps) {
    const [isPlayModesOpen, setIsPlayModesOpen] = useState(false)
    const [backgroundSource, setBackgroundSource] = useState(viewModel.stage.backgroundSrc)

    useEffect(() => {
        setBackgroundSource(viewModel.stage.backgroundSrc)
    }, [viewModel.stage.backgroundSrc])

    function handleBackgroundError() {
        if (backgroundSource !== viewModel.stage.backgroundFallbackSrc) {
            setBackgroundSource(viewModel.stage.backgroundFallbackSrc)
        }
    }

    return (
        <section className="home-screen" aria-busy={viewModel.playModes.isBusy}>
            <img className="home-screen__background" src={backgroundSource} alt="" onError={handleBackgroundError} />
            <div className="home-screen__backdrop" aria-hidden="true" />
            <HomeTopBar player={viewModel.player} isOnline={viewModel.connection.isOnline} />
            <HomeBrand />
            <HomeCreatureStage creature={viewModel.creature} shortcuts={viewModel.shortcuts} />
            <HomePrimaryNavigation navigation={viewModel.navigation} onOpenPlayModes={() => setIsPlayModesOpen(true)} />
            <HomeNotices notices={viewModel.notices} />
            <HomePlayModes
                mode={viewModel.mode}
                playModes={viewModel.playModes}
                actions={actions}
                isOpen={isPlayModesOpen}
                onClose={() => setIsPlayModesOpen(false)}
            />
        </section>
    )
}
