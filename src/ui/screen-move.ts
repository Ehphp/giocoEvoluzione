/** How one screen replaces another. Derived from depth, never chosen by hand at a call site. */
export type ScreenMove = 'push' | 'pop' | 'fade'

/**
 * Reads a depth change as a move: deeper pushes, shallower pops, level cross-fades.
 *
 * Depth is the whole vocabulary on purpose. A transition that could be argued for case by case
 * ends up inconsistent, so the only question a new screen has to answer is where it sits relative
 * to the ones it is reached from — see `src/app/screen-depth.ts`.
 */
export function moveBetweenDepths(from: number, to: number): ScreenMove {
    if (to > from) return 'push'
    if (to < from) return 'pop'
    return 'fade'
}
