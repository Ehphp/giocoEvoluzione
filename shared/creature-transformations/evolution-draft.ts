import { isEvolutionTargetId, type EvolutionTargetId } from './evolution-targets.ts'
import { BODY_PLANS } from './flux-evolution/body-plan-registry.ts'

/**
 * Battle-start evolution draft.
 *
 * At the start of a match each player is offered two anatomical targets and picks one. Winning
 * the match credits a win to the chosen target's counter; losing or drawing credits nothing.
 * The draw and the choice are persisted server-side — the client never decides which counter
 * is credited.
 *
 * Which targets can be drawn comes from the creature's body plan, so a creature without limbs
 * is never offered a limb evolution.
 */

export const EVOLUTION_DRAFT_OPTION_COUNT = 2

/** Wins needed on a single target before it can be spent on a transformation. */
export const DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED = 3

/**
 * The targets of the starter body plan. The database draw uses the same list; a body plan with a
 * different set is filtered server-side before a target can be selected or generated.
 */
export const DEFAULT_DRAFTABLE_EVOLUTION_TARGET_IDS: readonly EvolutionTargetId[] = BODY_PLANS.QUADRUPED.evolutionTargets

export type EvolutionDraft = Readonly<{
    options: readonly EvolutionTargetId[]
    chosenTargetId: EvolutionTargetId | null
}>

export type EvolutionTargetProgress = Readonly<{
    evolutionTargetId: EvolutionTargetId
    wins: number
    target: number
}>

export function readEvolutionTargetWinsRequired(value: string | undefined): number {
    const parsed = Number(value)

    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
        ? parsed
        : DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED
}

/**
 * Draws the distinct targets offered at the start of a match.
 *
 * `random` is injectable so the draw is deterministic under test; the database performs the
 * authoritative draw when the player row is created.
 */
export function drawEvolutionDraftOptions(
    random: () => number = Math.random,
    count = EVOLUTION_DRAFT_OPTION_COUNT,
    availableTargets: readonly EvolutionTargetId[] = DEFAULT_DRAFTABLE_EVOLUTION_TARGET_IDS,
): EvolutionTargetId[] {
    const pool = [...availableTargets]

    for (let index = pool.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1))
        ;[pool[index], pool[swap]] = [pool[swap]!, pool[index]!]
    }

    return pool.slice(0, Math.max(1, Math.min(count, pool.length)))
}

/** A choice is valid only if it is one of the options this player was actually offered. */
export function isChoosableEvolutionTarget(options: readonly string[], candidate: unknown): candidate is EvolutionTargetId {
    return isEvolutionTargetId(candidate) && options.includes(candidate)
}

export function normalizeEvolutionDraftOptions(value: unknown): EvolutionTargetId[] {
    return Array.isArray(value) ? value.filter(isEvolutionTargetId) : []
}

/** Wins are credited to the chosen target, and only to the winner. */
export function awardedEvolutionTargetWin(outcome: 'WIN' | 'LOSS' | 'DRAW'): 0 | 1 {
    return outcome === 'WIN' ? 1 : 0
}

export function isEvolutionTargetReady(progress: Pick<EvolutionTargetProgress, 'wins' | 'target'>): boolean {
    return progress.wins >= progress.target
}

/** Fills in the targets a creature has never accumulated on, so the UI always shows all of them. */
export function completeEvolutionTargetProgress(
    stored: readonly EvolutionTargetProgress[],
    winsRequired = DEFAULT_EVOLUTION_TARGET_WINS_REQUIRED,
    availableTargets: readonly EvolutionTargetId[] = DEFAULT_DRAFTABLE_EVOLUTION_TARGET_IDS,
): EvolutionTargetProgress[] {
    return availableTargets.map((evolutionTargetId) => {
        const entry = stored.find((candidate) => candidate.evolutionTargetId === evolutionTargetId)

        return entry ?? { evolutionTargetId, wins: 0, target: winsRequired }
    })
}
