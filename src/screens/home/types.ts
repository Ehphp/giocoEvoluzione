export type HomeBusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null

export type HomeNotice = {
    id: 'offline' | 'error' | 'status'
    tone: 'warning' | 'error' | 'success'
    message: string
}

export type HomeCreatureImage = {
    src: string
    fallbackSrc: string
    alt: string
    scale?: number
    offsetX?: number
    offsetY?: number
}

export type HomeCreatureVisualVersion = {
    id: string
    generation: number
    name: string
    image: HomeCreatureImage
    isCurrent: boolean
}

export type HomeViewModel = {
    mode: 'guest' | 'authenticated'
    player: {
        displayName: string | null
        avatarUrl?: string
        accountLevel?: number
        experience?: { current: number; required: number }
        rankLabel?: string
    }
    creature: {
        id?: string
        name: string
        shortDescription?: string
        image: HomeCreatureImage
        visualVersions: ReadonlyArray<HomeCreatureVisualVersion>
        level?: number
        experience?: { current: number; required: number }
        evolution?: { current: number; total: number; label?: string }
    } | null
    stage: {
        backgroundSrc: string
        backgroundFallbackSrc: string
    }
    connection: {
        isOnline: boolean
    }
    resources: Array<{
        id: string
        label: string
        value: number
    }>
    shortcuts: Array<{
        id: 'missions' | 'rewards' | 'evolution'
        label: string
        badge?: number
        available: boolean
    }>
    navigation: Array<{
        id: 'play' | 'collection' | 'rankings' | 'profile'
        label: string
        available: boolean
    }>
    playModes: {
        nickname: string
        roomCode: string
        botDifficulty: 'EASY' | 'NORMAL' | 'HARD'
        isBusy: boolean
        busyAction: HomeBusyAction
    }
    notices: HomeNotice[]
    capabilities: {
        profile: boolean
        collection: boolean
        rankings: boolean
        rewards: boolean
        settings: boolean
    }
}

export type HomeActions = {
    onNicknameChange: (value: string) => void
    onRoomCodeChange: (value: string) => void
    onBotDifficultyChange: (value: 'EASY' | 'NORMAL' | 'HARD') => void
    onCreateGame: () => void
    onCreateBotGame: () => void
    onJoinGame: () => void
    onLeaveSession: () => void
    onOpenProfile: () => void
    onOpenCollection: () => void
    onOpenRanking: () => void
    onLogout: () => void
}
