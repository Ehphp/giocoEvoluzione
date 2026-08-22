import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { ScreenLeavingContext } from './screen-leaving'
import { moveBetweenDepths, type ScreenMove } from './screen-move'

import './screen-transition.css'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type ScreenLayer = {
    key: string
    depth: number
    node: ReactNode
}

type ScreenTransitionProps = {
    /** Identity of the screen on show. A change here is what starts a transition. */
    screenKey: string
    /**
     * How deep the screen sits in navigation. Deeper than the screen it replaces pushes, shallower
     * pops, equal cross-fades. Give every destination reachable from the dock the same depth: they
     * are siblings, and a cross-fade is what keeps the dock from sliding along with the content.
     */
    depth: number
    children: ReactNode
}

type SwapState = {
    key: string
    move: ScreenMove
    /** The screen being replaced, held only for the length of its exit animation. */
    leaving: ScreenLayer | null
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Safety net. `animationend` is the real signal; this only fires if it never arrives — an animation
 * the browser refused to run would otherwise pin a dead screen over the live one forever.
 */
const CLEANUP_FALLBACK_MS = 900

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Animates the swap from one screen to the next.
 *
 * The outgoing screen keeps its React instance and its DOM node — it is the same keyed layer,
 * re-rendered with the props it last had rather than re-mounted — so scroll positions and internal
 * state survive the exit instead of snapping back while the player watches it leave.
 */
export function ScreenTransition({ screenKey, depth, children }: ScreenTransitionProps) {
    const [swap, setSwap] = useState<SwapState>({ key: screenKey, move: 'fade', leaving: null })
    const previous = useRef<ScreenLayer>({ key: screenKey, depth, node: children })

    // Written after the commit, so during the render that swaps screens it still describes the
    // outgoing one. That is the whole trick: no extra state is needed to capture what is leaving.
    useEffect(() => {
        previous.current = { key: screenKey, depth, node: children }
    }, [children, depth, screenKey])

    const dropLeaving = useCallback(() => {
        setSwap((current) => (current.leaving ? { ...current, leaving: null } : current))
    }, [])

    useEffect(() => {
        if (!swap.leaving) return

        const timer = window.setTimeout(dropLeaving, CLEANUP_FALLBACK_MS)
        return () => window.clearTimeout(timer)
    }, [dropLeaving, swap.leaving])

    // Adjusting state during render: the incoming and outgoing layers have to reach the DOM in the
    // same commit, or the exit animation would start a frame late and flicker.
    if (swap.key !== screenKey) {
        const outgoing = previous.current.key === screenKey ? null : previous.current

        setSwap({
            key: screenKey,
            move: outgoing ? moveBetweenDepths(outgoing.depth, depth) : swap.move,
            leaving: outgoing,
        })
    }

    // The render that triggered the adjustment above is discarded, so it renders nothing extra.
    const isSettled = swap.key === screenKey
    const leaving = isSettled ? swap.leaving : null

    return (
        <div className="ev-screen-swap" data-move={isSettled ? swap.move : 'fade'}>
            {/*
              * Order matters and is not cosmetic: the outgoing layer stays first so React's keyed
              * reconciliation never has to move either node. Depth is expressed with `z-index`.
              */}
            {leaving ? (
                <div
                    key={leaving.key}
                    className="ev-screen-layer ev-screen-layer--leaving"
                    aria-hidden="true"
                    inert
                    onAnimationEnd={(event) => {
                        if (event.target === event.currentTarget) dropLeaving()
                    }}
                >
                    {/*
                      * Both layers carry the provider even though only one can be leaving. A layer
                      * that gained or lost it on the way out would change shape mid-transition, and
                      * React would re-mount the screen underneath it — losing exactly the scroll
                      * position and state this component exists to preserve.
                      */}
                    <ScreenLeavingContext.Provider value={true}>{leaving.node}</ScreenLeavingContext.Provider>
                </div>
            ) : null}
            <div key={screenKey} className="ev-screen-layer ev-screen-layer--entering">
                <ScreenLeavingContext.Provider value={false}>{children}</ScreenLeavingContext.Provider>
            </div>
        </div>
    )
}
