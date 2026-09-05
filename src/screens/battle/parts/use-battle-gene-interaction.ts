import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

import { playCue } from '../../../ui/feedback/feedback'
import type { GeneActionCommandV2, GeneCardV2 } from '../controller/types'

export type BattleDropTarget = 'player' | 'opponent'

export type BattleGeneInteractionState = {
    phase: 'idle' | 'pressed' | 'dragging' | 'committing'
    geneId: string | null
    clientX: number
    clientY: number
    target: BattleDropTarget | null
}

type UseBattleGeneInteractionOptions = {
    genes: GeneCardV2[]
    isEnabled: boolean
    onSelectGene: (geneId: string) => void
    onSubmitGeneAction: (command: GeneActionCommandV2) => Promise<boolean>
}

type PointerSession = {
    pointerId: number
    geneId: string
    startX: number
    startY: number
    source: HTMLButtonElement
    isDragging: boolean
    isLongPressActive: boolean
}

const DRAG_THRESHOLD_PX = 10
const LONG_PRESS_DELAY_MS = 350
const IDLE_STATE: BattleGeneInteractionState = {
    phase: 'idle',
    geneId: null,
    clientX: 0,
    clientY: 0,
    target: null,
}

function containsPoint(rect: DOMRect, clientX: number, clientY: number, includeRightEdge: boolean): boolean {
    const insideX = clientX >= rect.left && (includeRightEdge ? clientX <= rect.right : clientX < rect.right)

    return insideX && clientY >= rect.top && clientY <= rect.bottom
}

export function useBattleGeneInteraction({ genes, isEnabled, onSelectGene, onSubmitGeneAction }: UseBattleGeneInteractionOptions) {
    const [interaction, setInteraction] = useState<BattleGeneInteractionState>(IDLE_STATE)
    const [longPressGeneId, setLongPressGeneId] = useState<string | null>(null)
    const pointerSessionRef = useRef<PointerSession | null>(null)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const suppressedClickGeneRef = useRef<string | null>(null)
    const commitLockRef = useRef(false)
    const mountedRef = useRef(true)
    const dropZoneRefs = useRef<Record<BattleDropTarget, HTMLDivElement | null>>({
        player: null,
        opponent: null,
    })

    useEffect(() => {
        if (isEnabled) {
            return
        }

        cancelPointerSession(true)
        setInteraction(IDLE_STATE)
    }, [isEnabled])

    useEffect(() => {
        mountedRef.current = true

        return () => {
            mountedRef.current = false
            cancelPointerSession(true, false)
        }
    }, [])

    function clearLongPressTimer() {
        if (longPressTimerRef.current === null) {
            return
        }

        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
    }

    function releasePointerCapture(session: PointerSession) {
        if (!session.source.hasPointerCapture?.(session.pointerId)) {
            return
        }

        session.source.releasePointerCapture?.(session.pointerId)
    }

    function cancelPointerSession(releaseCapture: boolean, updateState = true) {
        const session = pointerSessionRef.current

        clearLongPressTimer()
        pointerSessionRef.current = null

        if (session && (session.isDragging || session.isLongPressActive)) {
            suppressedClickGeneRef.current = session.geneId
        }

        if (releaseCapture && session) {
            releasePointerCapture(session)
        }

        if (updateState && mountedRef.current) {
            setLongPressGeneId(null)
            setInteraction(IDLE_STATE)
        }
    }

    function resolveDropTarget(clientX: number, clientY: number): BattleDropTarget | null {
        const playerRect = dropZoneRefs.current.player?.getBoundingClientRect()
        const opponentRect = dropZoneRefs.current.opponent?.getBoundingClientRect()

        if (playerRect && containsPoint(playerRect, clientX, clientY, false)) {
            return 'player'
        }

        if (opponentRect && containsPoint(opponentRect, clientX, clientY, true)) {
            return 'opponent'
        }

        return null
    }

    function handlePointerDown(geneId: string, event: PointerEvent<HTMLButtonElement>) {
        if (!isEnabled || commitLockRef.current || pointerSessionRef.current || event.button !== 0 || event.isPrimary === false) {
            return
        }

        suppressedClickGeneRef.current = null
        const session: PointerSession = {
            pointerId: event.pointerId,
            geneId,
            startX: event.clientX,
            startY: event.clientY,
            source: event.currentTarget,
            isDragging: false,
            isLongPressActive: false,
        }

        pointerSessionRef.current = session
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setInteraction({
            phase: 'pressed',
            geneId,
            clientX: event.clientX,
            clientY: event.clientY,
            target: null,
        })
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null

            if (pointerSessionRef.current !== session || session.isDragging) {
                return
            }

            session.isLongPressActive = true
            suppressedClickGeneRef.current = geneId
            setLongPressGeneId(geneId)
        }, LONG_PRESS_DELAY_MS)
    }

    function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
        const session = pointerSessionRef.current

        if (!session || session.pointerId !== event.pointerId) {
            return
        }

        if (!session.isDragging) {
            const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)

            if (distance < DRAG_THRESHOLD_PX) {
                return
            }

            session.isDragging = true
            session.isLongPressActive = false
            suppressedClickGeneRef.current = session.geneId
            clearLongPressTimer()
            setLongPressGeneId(null)
        }

        event.preventDefault()
        setInteraction({
            phase: 'dragging',
            geneId: session.geneId,
            clientX: event.clientX,
            clientY: event.clientY,
            target: resolveDropTarget(event.clientX, event.clientY),
        })
    }

    function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
        const session = pointerSessionRef.current

        if (!session || session.pointerId !== event.pointerId) {
            return
        }

        if (!session.isDragging) {
            cancelPointerSession(true)
            return
        }

        event.preventDefault()
        const target = resolveDropTarget(event.clientX, event.clientY)
        const gene = genes.find((candidate) => candidate.id === session.geneId)
        const isAvailable = target === 'player' ? gene?.evolvable : target === 'opponent' ? gene?.usable : false
        const command = target && gene && isAvailable
            ? { geneId: gene.id, actionType: target === 'player' ? 'EVOLVE' as const : 'USE' as const }
            : null

        cancelPointerSession(true)

        if (!command) {
            if (target && gene) {
                playCue('alert')
            }

            return
        }

        if (commitLockRef.current) {
            return
        }

        commitLockRef.current = true
        setInteraction({
            phase: 'committing',
            geneId: command.geneId,
            clientX: 0,
            clientY: 0,
            target: null,
        })
        onSelectGene(command.geneId)
        playCue(command.actionType === 'EVOLVE' ? 'evolve' : 'confirm')

        const finishCommit = () => {
            commitLockRef.current = false

            if (mountedRef.current) {
                setInteraction(IDLE_STATE)
            }
        }

        try {
            void onSubmitGeneAction(command)
                .catch(() => false)
                .finally(finishCommit)
        } catch {
            finishCommit()
        }
    }

    function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
        const session = pointerSessionRef.current

        if (!session || session.pointerId !== event.pointerId) {
            return
        }

        cancelPointerSession(true)
    }

    function handleLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
        const session = pointerSessionRef.current

        if (!session || session.pointerId !== event.pointerId) {
            return
        }

        cancelPointerSession(false)
    }

    const registerDropZone = useCallback((target: BattleDropTarget, element: HTMLDivElement | null) => {
        dropZoneRefs.current[target] = element
    }, [])

    function consumeSuppressedClick(geneId: string): boolean {
        if (suppressedClickGeneRef.current !== geneId) {
            return false
        }

        suppressedClickGeneRef.current = null
        return true
    }

    return {
        interaction,
        longPressGeneId,
        registerDropZone,
        consumeSuppressedClick,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onLostPointerCapture: handleLostPointerCapture,
    }
}
