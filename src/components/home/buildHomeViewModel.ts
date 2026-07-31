import type { HomeBusyAction, HomeNotice, HomeViewModel } from './types'

export type BuildGuestHomeViewModelInput = {
    nickname: string
    roomCode: string
    botDifficulty: 'EASY' | 'NORMAL' | 'HARD'
    isOnline: boolean
    errorMessage: string | null
    statusMessage: string | null
    isBusy: boolean
    busyAction: HomeBusyAction
}

const HOME_BACKGROUND_FALLBACK = '/assets/game-ui/placeholders/background.svg'
const PLAYER_CREATURE_FALLBACK = '/assets/battle/creatures/verdant-hatchling.png'

export function buildGuestHomeViewModel({
    nickname,
    roomCode,
    botDifficulty,
    isOnline,
    errorMessage,
    statusMessage,
    isBusy,
    busyAction,
}: BuildGuestHomeViewModelInput): HomeViewModel {
    const notices: HomeNotice[] = []

    if (!isOnline) {
        notices.push({
            id: 'offline',
            tone: 'warning',
            message: 'Connessione offline. La sincronizzazione riprende appena torna la rete.',
        })
    }

    if (errorMessage) {
        notices.push({ id: 'error', tone: 'error', message: errorMessage })
    }

    if (statusMessage) {
        notices.push({ id: 'status', tone: 'success', message: statusMessage })
    }

    return {
        mode: 'guest',
        player: {
            displayName: nickname.trim() || null,
        },
        creature: {
            name: 'La tua creatura',
            image: {
                src: PLAYER_CREATURE_FALLBACK,
                fallbackSrc: PLAYER_CREATURE_FALLBACK,
                alt: 'Creatura verde del giocatore',
                scale: .92,
            },
        },
        stage: {
            backgroundSrc: '/assets/battle/backgrounds/enchanted-forest.png',
            backgroundFallbackSrc: HOME_BACKGROUND_FALLBACK,
        },
        connection: {
            isOnline,
        },
        resources: [],
        shortcuts: [],
        navigation: [
            { id: 'play', label: 'Gioca', available: true },
            { id: 'collection', label: 'Collezione', available: false },
            { id: 'rankings', label: 'Classifica', available: false },
            { id: 'profile', label: 'Profilo', available: false },
        ],
        playModes: {
            nickname,
            roomCode,
            botDifficulty,
            isBusy,
            busyAction,
        },
        notices,
        capabilities: {
            profile: false,
            collection: false,
            rankings: false,
            rewards: false,
            settings: false,
        },
    }
}
