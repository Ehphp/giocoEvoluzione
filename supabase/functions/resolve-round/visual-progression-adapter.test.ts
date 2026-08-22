import { describe, expect, it } from 'vitest'

import { createMatchCompletionEvents } from './visual-progression-adapter.ts'

describe('match completion visual progression adapter', () => {
    it('converts only generic final outcomes and ignores the bot identity', () => {
        expect(
            createMatchCompletionEvents({
                gameId: 'game',
                winnerPlayerId: 'p1',
                completedAt: '2026-08-04T00:00:00.000Z',
                participants: [
                    { id: 'p1', profileId: 'profile', creatureId: 'creature' },
                    { id: 'bot', profileId: null, creatureId: null },
                ],
            }),
        ).toEqual([
            {
                gameId: 'game',
                profileId: 'profile',
                creatureId: 'creature',
                outcome: 'WIN',
                completedAt: '2026-08-04T00:00:00.000Z',
            },
        ])
    })

    it('keeps a draw distinct from a loss', () => {
        expect(
            createMatchCompletionEvents({
                gameId: 'game',
                winnerPlayerId: null,
                completedAt: '2026-08-04T00:00:00.000Z',
                participants: [{ id: 'p1', profileId: 'profile', creatureId: 'creature' }],
            })[0]?.outcome,
        ).toBe('DRAW')
    })
})
