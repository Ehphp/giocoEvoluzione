import type { HomeBusyAction, HomeNotice, HomeViewModel } from './types'
import type { PlayerCreatureRecord, ProfileRecord } from '../../lib/profile-api'
import { getExperienceProgress } from '../../lib/progression'
import { ASSETS } from '../../ui/assets'
import { buildCreatureVisualVersions, type CreatureVisualVersionSource } from '../../components/creature-visual-progression/visualVersions'

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

const HOME_BACKGROUND_FALLBACK = ASSETS.scenery.fallback
const PLAYER_CREATURE_FALLBACK = ASSETS.creatures.default

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
                scale: 1,
            },
            visualVersions: [{
                id: 'guest-creature',
                generation: 1,
                name: 'Forma iniziale',
                image: {
                    src: PLAYER_CREATURE_FALLBACK,
                    fallbackSrc: PLAYER_CREATURE_FALLBACK,
                    alt: 'Creatura verde del giocatore',
                    scale: 1,
                },
                isCurrent: true,
            }],
        },
        stage: {
            backgroundSrc: ASSETS.scenery.forest,
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

export function buildAuthenticatedHomeViewModel(input: BuildGuestHomeViewModelInput & {
    profile: ProfileRecord
    creature: PlayerCreatureRecord
    officialVisualUrl?: string | null
    visualVersionNumber?: number | null
    visualTrait?: string | null
    currentVisualShortDescription?: string | null
    visualHistory?: ReadonlyArray<CreatureVisualVersionSource>
    currentVisualVersionId?: string | null
}): HomeViewModel {
    const base = buildGuestHomeViewModel({
        nickname: input.profile.nickname,
        roomCode: input.roomCode,
        botDifficulty: input.botDifficulty,
        isOnline: input.isOnline,
        errorMessage: input.errorMessage,
        statusMessage: input.statusMessage,
        isBusy: input.isBusy,
        busyAction: input.busyAction,
    })
    const experience = getExperienceProgress(input.creature.experience)
    const visualVersions = buildCreatureVisualVersions({
        history: input.visualHistory,
        currentVersionId: input.currentVisualVersionId,
        currentVersionNumber: input.visualVersionNumber,
        fallback: {
            id: input.currentVisualVersionId ?? input.creature.id,
            versionNumber: input.visualVersionNumber ?? 1,
            visualTraitId: input.visualTrait ?? null,
            conceptName: null,
            signedUrl: input.officialVisualUrl ?? PLAYER_CREATURE_FALLBACK,
        },
    }).map((version) => ({
        id: version.id,
        generation: version.versionNumber,
        name: version.name,
        image: {
            src: version.signedUrl,
            fallbackSrc: PLAYER_CREATURE_FALLBACK,
            alt: `${input.creature.name ?? 'La tua creatura'}, Generazione ${version.versionNumber - 1}`,
        },
        isCurrent: version.isCurrent,
    }))
    const currentVisual = visualVersions.find((version) => version.isCurrent) ?? visualVersions.at(-1)!

    return {
        ...base,
        mode: 'authenticated',
        player: {
            displayName: input.profile.nickname,
            accountLevel: input.creature.level,
            experience,
            rankLabel: `Rating ${new Intl.NumberFormat('it-IT').format(input.profile.skill_rating)}`,
        },
        creature: {
            ...base.creature!,
            image: currentVisual.image,
            visualVersions,
            id: input.creature.id,
            name: input.creature.name ?? 'Creatura iniziale',
            ...(input.currentVisualShortDescription ? { shortDescription: input.currentVisualShortDescription } : {}),
            level: input.creature.level,
            experience,
        },
        navigation: base.navigation.map((item) => item.id === 'profile' || item.id === 'rankings' || item.id === 'collection' ? { ...item, available: true } : item),
        capabilities: {
            ...base.capabilities,
            profile: true,
            collection: true,
            rankings: true,
            rewards: true,
        },
    }
}
