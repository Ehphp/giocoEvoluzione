import { useEffect, useRef, useState, type PointerEvent } from 'react'

type PointerStart = {
    pointerId: number
    x: number
    y: number
}

type UseGeneLongPressOptions = {
    disabled: boolean
}

const LONG_PRESS_DELAY_MS = 350
const LONG_PRESS_MOVE_THRESHOLD_PX = 10

export function useGeneLongPress({ disabled }: UseGeneLongPressOptions) {
    const [isLongPressActive, setIsLongPressActive] = useState(false)
    const pointerStartRef = useRef<PointerStart | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const suppressNextClickRef = useRef(false)

    function clearLongPressTimer() {
        if (timerRef.current === null) {
            return
        }

        clearTimeout(timerRef.current)
        timerRef.current = null
    }

    function clearLongPress() {
        clearLongPressTimer()
        pointerStartRef.current = null
        setIsLongPressActive(false)
    }

    useEffect(() => () => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }

        pointerStartRef.current = null
    }, [])

    useEffect(() => {
        if (disabled) {
            clearLongPressTimer()
            pointerStartRef.current = null
            setIsLongPressActive(false)
        }
    }, [disabled])

    function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (disabled || event.button !== 0) {
            return
        }

        clearLongPress()
        suppressNextClickRef.current = false
        pointerStartRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            if (!pointerStartRef.current) {
                return
            }

            suppressNextClickRef.current = true
            setIsLongPressActive(true)
        }, LONG_PRESS_DELAY_MS)
    }

    function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
        const pointerStart = pointerStartRef.current

        if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
            return
        }

        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) <= LONG_PRESS_MOVE_THRESHOLD_PX) {
            return
        }

        clearLongPress()
    }

    function handlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
        const pointerStart = pointerStartRef.current

        if (pointerStart && pointerStart.pointerId !== event.pointerId) {
            return
        }

        clearLongPress()
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
        }
    }

    function consumeLongPressClick(): boolean {
        if (!suppressNextClickRef.current) {
            return false
        }

        suppressNextClickRef.current = false
        return true
    }

    return {
        isLongPressActive,
        consumeLongPressClick,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerEnd,
        onPointerCancel: handlePointerEnd,
        onLostPointerCapture: handlePointerEnd,
    }
}
