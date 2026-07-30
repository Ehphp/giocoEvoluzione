import { buildPersistedRoundResolution } from '../../../shared/game-rules/persisted-round-resolution.ts'

export function resolveEdgeRound(params: Parameters<typeof buildPersistedRoundResolution>[0]) {
    return buildPersistedRoundResolution(params)
}
