import type { FineDelMondoOutcome } from '../../../shared/game-rules/types.ts'

/**
 * Server-authoritative, retry-stable draw for FINE_DEL_MONDO.  The secret is
 * deliberately not persisted or exposed to the client: storing the resulting
 * outcome in the atomic match commit makes later snapshots self-contained.
 */
export async function drawFineDelMondoOutcome(input: {
    secret: string
    gameId: string
    roundNumber: number
    playerId: string
    mutationId: 'FINE_DEL_MONDO'
    ruleVersion: string
}): Promise<FineDelMondoOutcome> {
    const message = `${input.gameId}|${input.roundNumber}|${input.playerId}|${input.mutationId}|${input.ruleVersion}`
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(input.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
    return (signature[0]! & 1) === 0 ? 'FINE_DEL_MONDO' : 'ERA_PROSPERA'
}
