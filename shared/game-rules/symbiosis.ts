import { MAX_ADAPTATION_LEVEL } from './catalog.ts'
import type { AdaptationId, AdaptationLevel, SymbiosisLink, SymbiosisPropagationEvent } from './types.ts'

export type DirectLevelUp = { playerId: string; trait: AdaptationId }
export type SymbiosisPropagationTarget = {
    targetPlayerId: string
    targetTrait: AdaptationId
    sourceLevelUps: DirectLevelUp[]
    pairKeys: string[]
    requestedLevels: number
}

/** A pair is a derived propagation identity only; full links retain mutation ownership. */
export function canonicalSymbiosisPairKey(link: Pick<SymbiosisLink, 'ownerPlayerId' | 'sourceTrait' | 'targetPlayerId' | 'targetTrait'>): string {
    return [`${link.ownerPlayerId}:${link.sourceTrait}`, `${link.targetPlayerId}:${link.targetTrait}`].sort().join('|')
}

function endpointKey(playerId: string, trait: AdaptationId): string { return `${playerId}:${trait}` }

/**
 * Computes reflected level increments from links present before the round. The
 * result deliberately contains no adaptation state, so callers can apply every
 * endpoint simultaneously and cap only after all overlapping links aggregate.
 */
export function resolveSymbiosisPropagation(links: readonly SymbiosisLink[], directLevelUps: readonly DirectLevelUp[]): SymbiosisPropagationTarget[] {
    const pairLinks = new Map<string, SymbiosisLink>()
    for (const link of links) {
        const key = canonicalSymbiosisPairKey(link)
        const current = pairLinks.get(key)
        if (!current || `${link.ownerPlayerId}:${link.sourceTrait}:${link.targetPlayerId}:${link.targetTrait}` < `${current.ownerPlayerId}:${current.sourceTrait}:${current.targetPlayerId}:${current.targetTrait}`) pairLinks.set(key, link)
    }
    const levelUps = new Set(directLevelUps.map((levelUp) => endpointKey(levelUp.playerId, levelUp.trait)))
    const requests = new Map<string, SymbiosisPropagationTarget>()
    for (const [pairKey, link] of [...pairLinks.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const sourceKey = endpointKey(link.ownerPlayerId, link.sourceTrait)
        const targetKey = endpointKey(link.targetPlayerId, link.targetTrait)
        const addRequest = (targetPlayerId: string, targetTrait: AdaptationId, source: DirectLevelUp) => {
            const key = endpointKey(targetPlayerId, targetTrait)
            const current = requests.get(key) ?? { targetPlayerId, targetTrait, sourceLevelUps: [], pairKeys: [], requestedLevels: 0 }
            current.sourceLevelUps.push(source)
            current.pairKeys.push(pairKey)
            current.requestedLevels += 1
            requests.set(key, current)
        }
        if (levelUps.has(sourceKey)) addRequest(link.targetPlayerId, link.targetTrait, { playerId: link.ownerPlayerId, trait: link.sourceTrait })
        if (levelUps.has(targetKey)) addRequest(link.ownerPlayerId, link.sourceTrait, { playerId: link.targetPlayerId, trait: link.targetTrait })
    }
    return [...requests.values()]
        .map((request) => ({ ...request, sourceLevelUps: [...request.sourceLevelUps].sort((left, right) => endpointKey(left.playerId, left.trait).localeCompare(endpointKey(right.playerId, right.trait))), pairKeys: [...request.pairKeys].sort() }))
        .sort((left, right) => endpointKey(left.targetPlayerId, left.targetTrait).localeCompare(endpointKey(right.targetPlayerId, right.targetTrait)))
}

export function applySymbiosisLevelIncrease(levelBefore: AdaptationLevel, requestedLevels: number): { appliedLevels: number; levelAfter: AdaptationLevel } {
    const levelAfter = Math.min(MAX_ADAPTATION_LEVEL, levelBefore + requestedLevels) as AdaptationLevel
    return { appliedLevels: levelAfter - levelBefore, levelAfter }
}

export function createSymbiosisPropagationEvent(target: SymbiosisPropagationTarget, levelBefore: AdaptationLevel): SymbiosisPropagationEvent {
    const { appliedLevels, levelAfter } = applySymbiosisLevelIncrease(levelBefore, target.requestedLevels)
    return { effect: 'LEVEL_REFLECTED', ...target, appliedLevels, levelBefore, levelAfter }
}
