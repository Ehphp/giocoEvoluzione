import type { CompetitiveLeaderboardEntry, PlayerCreatureRecord, ProfileMatchHistoryItem, ProfileRecord } from '../lib/profile-api'
import type { GeneCardV2, GeneSelectionViewModelV2 } from '../components/game-v2/types'
import { getEventAssetByArtKey, getGeneAssetByTrait } from '../components/game-v2/gameSelectionAssets'
import { buildAuthenticatedHomeViewModel } from '../screens/home/buildHomeViewModel'
import type { HomeViewModel } from '../screens/home/types'

/**
 * Deterministic fixtures for the development-only UI preview.
 * They feed the real view-model shapes so presentation can be iterated without a backend session.
 */

export const PREVIEW_PROFILE: ProfileRecord = {
    id: 'preview-profile',
    nickname: 'Naturalista',
    skill_rating: 1000,
    created_at: '2026-01-04T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
}

export const PREVIEW_CREATURE: PlayerCreatureRecord = {
    id: 'preview-creature',
    profile_id: 'preview-profile',
    base_creature_key: 'verdant-hatchling',
    name: 'Verdello',
    level: 4,
    experience: 108,
    progression_state: {},
    current_visual_version_id: 'preview-visual-3',
    created_at: '2026-01-04T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
}

export const PREVIEW_HISTORY: ProfileMatchHistoryItem[] = [
    { gameId: 'g-1', date: '2026-08-06T18:20:00.000Z', mode: 'PVP', opponentNickname: 'Wild_Hunter', outcome: 'win', score: 5, opponentScore: 3, roomCode: 'K4TZQ', status: 'FINISHED' },
    { gameId: 'g-2', date: '2026-08-05T21:02:00.000Z', mode: 'VS_BOT', opponentNickname: 'Bot Normale', outcome: 'loss', score: 2, opponentScore: 5, roomCode: null, status: 'FINISHED' },
    { gameId: 'g-3', date: '2026-08-05T09:41:00.000Z', mode: 'PVP', opponentNickname: 'Micelio', outcome: 'draw', score: 4, opponentScore: 4, roomCode: 'B8XRM', status: 'FINISHED' },
    { gameId: 'g-4', date: '2026-08-03T17:15:00.000Z', mode: 'PVP', opponentNickname: 'Ombra', outcome: 'win', score: 6, opponentScore: 1, roomCode: 'PP31D', status: 'FINISHED' },
    { gameId: 'g-5', date: '2026-08-02T12:05:00.000Z', mode: 'VS_BOT', opponentNickname: 'Bot Difficile', outcome: 'win', score: 5, opponentScore: 4, roomCode: null, status: 'FINISHED' },
]

export const PREVIEW_LEADERBOARD: CompetitiveLeaderboardEntry[] = [
    { position: 1, nickname: 'Aquila', skillRating: 1086 },
    { position: 2, nickname: 'Naturalista', skillRating: 1000 },
    { position: 3, nickname: 'Micelio', skillRating: 978 },
]

export const PREVIEW_VISUAL_HISTORY = [
    { id: 'preview-visual-1', versionNumber: 1, visualTraitId: null, conceptName: 'Forma base', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-2', versionNumber: 2, visualTraitId: 'ARMOR', conceptName: 'Scaglie dorsali', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-3', versionNumber: 3, visualTraitId: 'AGILITY', conceptName: 'Arti slanciati', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-4', versionNumber: 4, visualTraitId: 'CAMOUFLAGE', conceptName: 'Manto del sottobosco', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-5', versionNumber: 5, visualTraitId: 'FEROCITY', conceptName: 'Artigli selvatici', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-6', versionNumber: 6, visualTraitId: 'ARMOR', conceptName: 'Corazza antica', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-7', versionNumber: 7, visualTraitId: 'SENSES', conceptName: 'Sguardo notturno', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-8', versionNumber: 8, visualTraitId: 'AGILITY', conceptName: 'Passo fulmineo', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
    { id: 'preview-visual-9', versionNumber: 9, visualTraitId: 'SENSES', conceptName: 'Corona di cristallo', signedUrl: '/assets/battle/creatures/verdant-hatchling.png', expiresAt: '2030-01-01T00:00:00.000Z' },
] as const

export function buildPreviewHomeViewModel(): HomeViewModel {
    return buildAuthenticatedHomeViewModel({
        nickname: PREVIEW_PROFILE.nickname,
        roomCode: '',
        botDifficulty: 'NORMAL',
        isOnline: true,
        errorMessage: null,
        statusMessage: null,
        isBusy: false,
        busyAction: null,
        profile: PREVIEW_PROFILE,
        creature: PREVIEW_CREATURE,
        visualVersionNumber: 3,
        visualHistory: PREVIEW_VISUAL_HISTORY,
        currentVisualVersionId: 'preview-visual-3',
    })
}

const PREVIEW_GENE_INPUT: ReadonlyArray<Pick<GeneCardV2, 'traitType' | 'name' | 'affinity' | 'level' | 'exhausted'> & { useScore: number; eventModifier: number }> = [
    { traitType: 'FEROCITY', name: 'Ferocia', affinity: 'unfavorable', level: 2, exhausted: false, useScore: 3, eventModifier: 0 },
    { traitType: 'ARMOR', name: 'Corazza', affinity: 'suitable', level: 2, exhausted: false, useScore: 5, eventModifier: 1 },
    { traitType: 'AGILITY', name: 'Agilita', affinity: 'ideal', level: 2, exhausted: false, useScore: 7, eventModifier: 2 },
    { traitType: 'SENSES', name: 'Sensi', affinity: 'ideal', level: 2, exhausted: false, useScore: 5, eventModifier: 2 },
    { traitType: 'CAMOUFLAGE', name: 'Mimetismo', affinity: 'suitable', level: 1, exhausted: true, useScore: 2, eventModifier: 1 },
]

export const PREVIEW_GENES: GeneCardV2[] = PREVIEW_GENE_INPUT.map(({ traitType, name, affinity, level, exhausted, useScore, eventModifier }) => ({
    id: traitType,
    traitType,
    name,
    level,
    affinity,
    imageUrl: getGeneAssetByTrait(traitType),
    usable: !exhausted,
    exhausted,
    strongAgainst: traitType === 'AGILITY' ? 'Corazza' : 'Sensi',
    weakAgainst: traitType === 'AGILITY' ? 'Mimetismo' : 'Ferocia',
    disabledReason: exhausted ? 'Esaurito: rigeneralo con EVOLVI' : undefined,
    prediction: {
        useScore,
        baseContribution: 2,
        levelContribution: level,
        eventModifier,
        reasons: ['La nebbia rallenta i movimenti ma aumenta la percezione.'],
    },
}))

export function buildPreviewBattleViewModel(selectedGeneId: string): GeneSelectionViewModelV2 {
    const selectedGene = PREVIEW_GENES.find((gene) => gene.id === selectedGeneId) ?? PREVIEW_GENES[0]!

    return {
        player: { id: 'preview-me', name: 'Naturalista', score: 3, roundValueTotal: 18, status: 'choosing' },
        opponent: { id: 'preview-opponent', name: 'Wild_Hunter', score: 2, roundValueTotal: 16, status: 'ready' },
        round: { current: 5, total: 7 },
        roundEvent: {
            id: 'preview-event',
            title: 'Palude nebbiosa',
            description: 'La nebbia rallenta i movimenti ma aumenta la percezione.',
            imageUrl: getEventAssetByArtKey('event-flash-flood'),
            effects: [
                { id: 'preview-agility', label: 'Agilita', modifier: 2, value: 'Ideale · Agilita', tone: 'positive' },
                { id: 'preview-senses', label: 'Sensi', modifier: 2, value: 'Ideale · Sensi', tone: 'positive' },
                { id: 'preview-armor', label: 'Corazza', modifier: 1, value: 'Adatto · Corazza', tone: 'neutral' },
                { id: 'preview-camouflage', label: 'Mimetismo', modifier: 1, value: 'Adatto · Mimetismo', tone: 'neutral' },
                { id: 'preview-ferocity', label: 'Ferocia', modifier: 0, value: 'Sfavorevole · Ferocia', tone: 'negative' },
            ],
        },
        nextRoundEvent: {
            id: 'preview-next-event',
            title: 'Picco termico persistente',
            description: 'Il calore prolungato premia il metabolismo efficiente.',
            imageUrl: getEventAssetByArtKey('event-heat-spike'),
            effects: [
                { id: 'preview-next-ferocity', label: 'Ferocia', modifier: 2, value: 'Ideale · Ferocia', tone: 'positive' },
            ],
        },
        genes: PREVIEW_GENES,
        selectedGeneId: selectedGene.id,
        selectedAction: null,
        selectedGene,
        status: 'choosing',
        actionsSubmitted: 0,
        canUse: selectedGene.usable,
        canEvolve: true,
        canSelectGenes: true,
    }
}
