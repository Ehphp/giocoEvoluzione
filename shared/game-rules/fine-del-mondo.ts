import { MAX_SCHEDULED_ROUNDS, MIN_SCHEDULED_ROUNDS, STANDARD_SCHEDULED_ROUNDS } from './catalog.ts'
import type { FineDelMondoActivation, FineDelMondoActivationRequest } from './types.ts'

export { STANDARD_SCHEDULED_ROUNDS, MIN_SCHEDULED_ROUNDS, MAX_SCHEDULED_ROUNDS }

export function isScheduledRounds(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= MIN_SCHEDULED_ROUNDS && value <= MAX_SCHEDULED_ROUNDS
}

export function assertScheduledRounds(value: unknown): asserts value is number {
    if (!isScheduledRounds(value)) throw new Error('Invalid scheduled rounds.')
}

export function cloneFineDelMondoActivations(activations: readonly FineDelMondoActivation[]): FineDelMondoActivation[] {
    return activations.map((activation) => ({ ...activation }))
}

export function validateFineDelMondoActivations(activations: readonly FineDelMondoActivation[]): void {
    if (activations.length > 2 || new Set(activations.map((activation) => activation.ownerPlayerId)).size !== activations.length) throw new Error('Invalid FINE_DEL_MONDO activation ownership.')
    for (const activation of activations) {
        if (!activation.ownerPlayerId || !Number.isInteger(activation.activatedRound) || activation.activatedRound < 3 || activation.activatedRound > MAX_SCHEDULED_ROUNDS || (activation.outcome !== 'FINE_DEL_MONDO' && activation.outcome !== 'ERA_PROSPERA')) throw new Error('Invalid FINE_DEL_MONDO activation.')
    }
}

function deltaFor(outcome: FineDelMondoActivation['outcome']): number {
    return outcome === 'FINE_DEL_MONDO' ? -2 : 3
}

/**
 * Applies all activation outcomes from one resolved round together. Summing
 * before clamping makes simultaneous player activations independent of order.
 */
export function resolveFineDelMondoDuration(input: {
    scheduledRounds: number
    activationsBefore: readonly FineDelMondoActivation[]
    requests: readonly FineDelMondoActivationRequest[]
    resolvedActivations: readonly FineDelMondoActivation[]
    resolvedRoundNumber: number
}) {
    assertScheduledRounds(input.scheduledRounds)
    validateFineDelMondoActivations(input.activationsBefore)
    if (new Set(input.requests.map((request) => request.ownerPlayerId)).size !== input.requests.length) throw new Error('Duplicate FINE_DEL_MONDO activation request.')
    if (input.requests.some((request) => request.activatedRound !== input.resolvedRoundNumber || input.activationsBefore.some((activation) => activation.ownerPlayerId === request.ownerPlayerId))) throw new Error('Invalid FINE_DEL_MONDO activation request.')
    if (input.resolvedActivations.length !== input.requests.length) throw new Error('Missing FINE_DEL_MONDO activation outcome.')
    const expectedOwners = [...input.requests].map((request) => request.ownerPlayerId).sort().join(',')
    const actualOwners = [...input.resolvedActivations].map((activation) => activation.ownerPlayerId).sort().join(',')
    if (expectedOwners !== actualOwners || input.resolvedActivations.some((activation) => activation.activatedRound !== input.resolvedRoundNumber)) throw new Error('Invalid FINE_DEL_MONDO activation outcome.')
    validateFineDelMondoActivations([...input.activationsBefore, ...input.resolvedActivations])
    const scheduledRounds = Math.max(MIN_SCHEDULED_ROUNDS, Math.min(MAX_SCHEDULED_ROUNDS, input.scheduledRounds + input.resolvedActivations.reduce((sum, activation) => sum + deltaFor(activation.outcome), 0)))
    if (scheduledRounds < input.resolvedRoundNumber) throw new Error('FINE_DEL_MONDO activation moved the deadline into the past.')
    return { scheduledRounds, activations: [...cloneFineDelMondoActivations(input.activationsBefore), ...cloneFineDelMondoActivations(input.resolvedActivations)] }
}
