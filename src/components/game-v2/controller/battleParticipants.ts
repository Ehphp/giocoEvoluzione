import type { PlayerRecord } from '../../../lib/game-api'

export type BattleParticipants = {
    localPlayer: PlayerRecord | null
    remotePlayer: PlayerRecord | null
}

/**
 * Makes the local/remote distinction explicit at the presentation boundary.
 * Slots are useful for score storage, but must never decide which side is local.
 */
export function buildBattleParticipants(players: PlayerRecord[], localPlayerId: string | null | undefined): BattleParticipants {
    const localPlayer = localPlayerId
        ? players.find((player) => player.id === localPlayerId) ?? null
        : null

    return {
        localPlayer,
        remotePlayer: localPlayer
            ? players.find((player) => player.id !== localPlayer.id) ?? null
            : null,
    }
}
