import { useEffect, useState } from 'react'

import { BUILD_ID } from '../../../app/build-id'

import './ProfileMenuDiagnostics.css'

type ProfileMenuDiagnosticsProps = {
    phase: string
    isInteractionLocked: boolean
}

type TriggerEventCounts = {
    pointerdown: number
    touchstart: number
    click: number
}

type OverlaySnapshot = {
    name: string
    display: string
    opacity: string
    pointerEvents: string
    zIndex: string
    rect: string
}

type DiagnosticSnapshot = {
    hasInert: boolean
    isOpen: boolean
    lastHit: string
    overlays: OverlaySnapshot[]
}

const DEBUG_QUERY_PARAMETER = 'debugProfileMenu'
const PROFILE_TRIGGER_SELECTOR = '.duel-card__profile-trigger'
const INITIAL_EVENT_COUNTS: TriggerEventCounts = {
    pointerdown: 0,
    touchstart: 0,
    click: 0,
}

function isDiagnosticsEnabled(): boolean {
    return new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAMETER) === '1'
}

function describeElement(element: Element | null): string {
    if (!element) {
        return 'nessuno'
    }

    const id = element.id ? `#${element.id}` : ''
    const classes = Array.from(element.classList).map((className) => `.${className}`).join('')
    const label = element.getAttribute('aria-label')

    return `${element.tagName.toLowerCase()}${id}${classes}${label ? ` [${label}]` : ''}`
}

function getEventPoint(event: Event): { x: number; y: number } | null {
    if ('touches' in event) {
        const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]

        return touch ? { x: touch.clientX, y: touch.clientY } : null
    }

    if ('clientX' in event && 'clientY' in event) {
        return { x: Number(event.clientX), y: Number(event.clientY) }
    }

    return null
}

function readOverlays(): OverlaySnapshot[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.ev-overlay')).map((overlay, index) => {
        const styles = window.getComputedStyle(overlay)
        const rect = overlay.getBoundingClientRect()
        const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')

        return {
            name: dialog?.getAttribute('aria-label') ?? `overlay ${index + 1}`,
            display: styles.display,
            opacity: styles.opacity,
            pointerEvents: styles.pointerEvents,
            zIndex: styles.zIndex,
            rect: `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        }
    })
}

function readSnapshot(lastHit = 'nessun tap registrato'): DiagnosticSnapshot {
    const battleScreen = document.querySelector<HTMLElement>('.battle-screen')
    const trigger = document.querySelector<HTMLButtonElement>(PROFILE_TRIGGER_SELECTOR)

    return {
        hasInert: battleScreen?.hasAttribute('inert') ?? false,
        isOpen: trigger?.getAttribute('aria-expanded') === 'true',
        lastHit,
        overlays: readOverlays(),
    }
}

export function ProfileMenuDiagnostics({ phase, isInteractionLocked }: ProfileMenuDiagnosticsProps) {
    const [eventCounts, setEventCounts] = useState(INITIAL_EVENT_COUNTS)
    const [snapshot, setSnapshot] = useState(() => readSnapshot())
    const enabled = isDiagnosticsEnabled()

    useEffect(() => {
        if (!enabled) {
            return undefined
        }

        const trigger = document.querySelector<HTMLButtonElement>(PROFILE_TRIGGER_SELECTOR)
        const battleScreen = document.querySelector<HTMLElement>('.battle-screen')
        const refresh = () => setSnapshot((current) => readSnapshot(current.lastHit))
        const recordEvent = (event: Event) => {
            const point = getEventPoint(event)
            const hitElement = point && document.elementFromPoint
                ? document.elementFromPoint(point.x, point.y)
                : event.target instanceof Element ? event.target : null

            setSnapshot(readSnapshot(describeElement(hitElement)))

            if (!trigger || !(event.target instanceof Node) || !trigger.contains(event.target)) {
                return
            }

            const eventType = event.type as keyof TriggerEventCounts
            setEventCounts((current) => ({ ...current, [eventType]: current[eventType] + 1 }))
        }
        const triggerObserver = trigger ? new MutationObserver(refresh) : null
        const battleObserver = battleScreen ? new MutationObserver(refresh) : null
        const bodyObserver = new MutationObserver(refresh)

        document.addEventListener('pointerdown', recordEvent, { capture: true, passive: true })
        document.addEventListener('touchstart', recordEvent, { capture: true, passive: true })
        document.addEventListener('click', recordEvent, { capture: true, passive: true })
        triggerObserver?.observe(trigger!, { attributes: true, attributeFilter: ['aria-expanded'] })
        battleObserver?.observe(battleScreen!, { attributes: true, attributeFilter: ['class', 'inert'] })
        bodyObserver.observe(document.body, { childList: true })
        refresh()

        return () => {
            document.removeEventListener('pointerdown', recordEvent, true)
            document.removeEventListener('touchstart', recordEvent, true)
            document.removeEventListener('click', recordEvent, true)
            triggerObserver?.disconnect()
            battleObserver?.disconnect()
            bodyObserver.disconnect()
        }
    }, [enabled])

    if (!enabled) {
        return null
    }

    return (
        <aside className="profile-menu-debug" aria-label="Diagnostica menu profilo" data-profile-menu-debug="true">
            <strong>Profile menu debug</strong>
            <dl>
                <div><dt>Build</dt><dd>{BUILD_ID}</dd></div>
                <div><dt>Origin</dt><dd>{window.location.origin}</dd></div>
                <div><dt>URL</dt><dd>{window.location.href}</dd></div>
                <div><dt>Phase</dt><dd>{phase}</dd></div>
                <div><dt>Locked</dt><dd>{String(isInteractionLocked)}</dd></div>
                <div><dt>Inert</dt><dd>{String(snapshot.hasInert)}</dd></div>
                <div><dt>Hit</dt><dd>{snapshot.lastHit}</dd></div>
                <div><dt>Trigger events</dt><dd>p:{eventCounts.pointerdown} t:{eventCounts.touchstart} c:{eventCounts.click}</dd></div>
                <div><dt>isOpen</dt><dd>{String(snapshot.isOpen)}</dd></div>
                <div><dt>Overlay</dt><dd>{snapshot.overlays.length}</dd></div>
            </dl>
            {snapshot.overlays.map((overlay, index) => (
                <p key={`${overlay.name}-${index}`}>
                    {index + 1}. {overlay.name}: d={overlay.display} o={overlay.opacity} pe={overlay.pointerEvents} z={overlay.zIndex} r={overlay.rect}
                </p>
            ))}
        </aside>
    )
}
