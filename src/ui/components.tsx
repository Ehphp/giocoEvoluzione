import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { srcSetFor } from './assets'
import { CloseIcon } from './icons'
import { useIsScreenLeaving } from './screen-leaving'
import { playCue } from './feedback/feedback'
import type { Cue } from './feedback/cues'

import './components.css'

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

type AppShellProps = {
    /** Painted backdrop rendered behind every layer. */
    sceneryUrl: string
    sceneryFallbackUrl?: string
    children: ReactNode
    /**
     * Whether the app's navigation dock is showing over this screen. The dock itself is not a child
     * of the shell — it outlives any one screen, so it is rendered once above the whole app — but
     * the screen still has to keep its content out from under it.
     */
    docked?: boolean
    scroll?: boolean
    className?: string
}

export function AppShell({ sceneryUrl, sceneryFallbackUrl, children, docked = false, scroll = false, className = '' }: AppShellProps) {
    return (
        <div className={`ev-shell ${docked ? 'ev-shell--docked' : ''} ${className}`}>
            {/*
              * The scenery is full-bleed, so `sizes` is simply the viewport — which is also the
              * default a browser assumes, but stating it keeps the intent readable. Resolving the
              * candidate set here rather than at the call site is what makes every screen's backdrop
              * responsive without any screen having to know: `srcSetFor` shrugs at a URL it does not
              * own, so a computed or signed background still works untouched.
              */}
            <img
                className="ev-shell__scenery"
                src={sceneryUrl}
                srcSet={srcSetFor(sceneryUrl)}
                sizes="100vw"
                alt=""
                onError={(event) => {
                    if (sceneryFallbackUrl && event.currentTarget.src !== sceneryFallbackUrl) {
                        event.currentTarget.srcset = ''
                        event.currentTarget.src = sceneryFallbackUrl
                    }
                }}
            />
            <div className="ev-shell__wash" aria-hidden="true" />
            <div className={`ev-shell__content ${scroll ? 'ev-shell__content--scroll' : ''}`}>{children}</div>
        </div>
    )
}

type ScreenHeaderProps = {
    /** `id` of the `h1`, for the screen's own `aria-labelledby`. */
    id?: string
    eyebrow?: string
    title: string
    subtitle?: string
}

/**
 * The header every dock destination wears: what this screen is, and nothing else.
 *
 * Three screens had grown three near-identical topbars, each with a slightly different title size
 * and its own set of buttons bolted on — so the same information moved and changed weight as the
 * player walked across the dock. Nothing here takes controls, and that is the point: the dock is how
 * you move between destinations, and account settings live behind the player's own row on the home
 * screen rather than being repeated on every screen that had room for them.
 */
export function ScreenHeader({ id, eyebrow, title, subtitle }: ScreenHeaderProps) {
    return (
        <header className="ev-screen-header">
            {eyebrow ? <span className="ev-eyebrow ev-eyebrow--light">{eyebrow}</span> : null}
            <h1 id={id} className="ev-truncate">{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
        </header>
    )
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

type PanelProps = {
    variant?: 'cream' | 'glass'
    flat?: boolean
    compact?: boolean
    className?: string
    children: ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

export function Panel({ variant = 'cream', flat = false, compact = false, className = '', children, ...rest }: PanelProps) {
    return (
        <div className={`ev-panel ev-panel--${variant} ${flat ? 'ev-panel--flat' : ''} ${compact ? 'ev-panel--compact' : ''} ${className}`} {...rest}>
            {children}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

export type ButtonTone = 'use' | 'evolve' | 'gold' | 'info' | 'cream' | 'ghost' | 'danger'

/**
 * What a press sounds like, read off the tone the button already carries.
 *
 * Tone is not decoration here — it is what the button *means* (§4), so it is also the right source
 * for the cue. A call site that needs something else passes `cue`; `cue={null}` presses in silence.
 */
const TONE_CUES: Readonly<Record<ButtonTone, Cue>> = {
    use: 'confirm',
    gold: 'confirm',
    evolve: 'evolve',
    danger: 'alert',
    info: 'tap',
    cream: 'tap',
    ghost: 'tap',
}

type ButtonProps = {
    tone?: ButtonTone
    block?: boolean
    size?: 'md' | 'sm'
    className?: string
    /** Overrides the cue the tone implies. `null` presses silently. */
    cue?: Cue | null
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ tone = 'use', block = false, size = 'md', className = '', type = 'button', cue, onClick, children, ...rest }: ButtonProps) {
    const resolvedCue = cue === undefined ? TONE_CUES[tone] : cue

    return (
        <button
            type={type}
            className={`ev-btn ev-btn--${tone} ${block ? 'ev-btn--block' : ''} ${size === 'sm' ? 'ev-btn--sm' : ''} ${className}`}
            onClick={(event) => {
                if (resolvedCue) playCue(resolvedCue)
                onClick?.(event)
            }}
            {...rest}
        >
            {children}
        </button>
    )
}

type ActionButtonProps = {
    tone: ButtonTone
    title: string
    hint: string
    value?: string
    glyph: ReactNode
    className?: string
    cue?: Cue | null
} & ButtonHTMLAttributes<HTMLButtonElement>

/** Large two-line call to action used for the round decision. */
export function ActionButton({ tone, title, hint, value, glyph, className = '', cue, onClick, ...rest }: ActionButtonProps) {
    const resolvedCue = cue === undefined ? TONE_CUES[tone] : cue

    return (
        <button
            type="button"
            className={`ev-btn ev-btn--${tone} ev-action-btn ${className}`}
            /*
             * The hint is clamped to the button's line budget, and a short screen gives it one line.
             * §7 allows that only while the full text stays reachable, so it lives here.
             */
            title={hint}
            onClick={(event) => {
                if (resolvedCue) playCue(resolvedCue)
                onClick?.(event)
            }}
            {...rest}
        >
            <span className="ev-action-btn__glyph" aria-hidden="true">{glyph}</span>
            <span className="ev-action-btn__copy">
                <span className="ev-action-btn__title">{title}</span>
                <span className="ev-action-btn__hint">
                    {value ? <strong className="ev-action-btn__value">{value}</strong> : null}
                    {hint}
                </span>
            </span>
        </button>
    )
}

type IconButtonProps = {
    label: string
    variant?: 'glass' | 'cream' | 'danger'
    size?: 'md' | 'lg'
    className?: string
    cue?: Cue | null
} & ButtonHTMLAttributes<HTMLButtonElement>

/**
 * Circular icon-only control.
 */
export function IconButton({ label, variant = 'glass', size = 'md', className = '', cue, onClick, children, ...rest }: IconButtonProps) {
    const resolvedCue = cue === undefined ? (variant === 'danger' ? 'alert' : 'tap') : cue

    return (
        <button
            type="button"
            className={`ev-icon-btn ${variant === 'glass' ? '' : `ev-icon-btn--${variant}`} ${size === 'lg' ? 'ev-icon-btn--lg' : ''} ${className}`}
            aria-label={label}
            title={label}
            onClick={(event) => {
                if (resolvedCue) playCue(resolvedCue)
                onClick?.(event)
            }}
            {...rest}
        >
            {children}
        </button>
    )
}

type PopoverMenuProps = {
    /** Accessible name of the menu. */
    label: string
    /** Accessible name of the control that opens it. */
    triggerLabel: string
    /** What the control looks like. Its styling comes from `triggerClassName`, not from here. */
    trigger: ReactNode
    className?: string
    triggerClassName?: string
    /** Which edge of the trigger the popover hangs from. `end` for a trigger near the right margin. */
    align?: 'start' | 'end'
    /** Called with `close`, so an item can dismiss the menu as it acts. */
    children: (close: () => void) => ReactNode
}

/**
 * A short list of actions hanging off the control that owns them.
 *
 * Closes on Escape and on a pointer down anywhere outside itself — `pointerdown` rather than
 * `click`, so it is already gone by the time the press lands on whatever was underneath.
 *
 * Deliberately not an `Overlay`: these are the two or three things attached to *this* control, not a
 * destination. A sheet would dim the screen and take a decision to dismiss, which is far too much
 * ceremony for "mute the sound".
 */
export function PopoverMenu({ label, triggerLabel, trigger, className = '', triggerClassName = '', align = 'start', children }: PopoverMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const menuId = useId()
    const menuRef = useRef<HTMLDivElement>(null)
    const close = useCallback(() => setIsOpen(false), [])

    useEffect(() => {
        if (!isOpen) return undefined

        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) close()
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close()
        }

        document.addEventListener('pointerdown', closeOnOutsidePointer)
        document.addEventListener('keydown', closeOnEscape)

        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [close, isOpen])

    return (
        <div ref={menuRef} className={`ev-menu ${className}`}>
            <button
                type="button"
                className={`ev-menu__trigger ${triggerClassName}`}
                aria-label={triggerLabel}
                aria-haspopup="menu"
                aria-controls={menuId}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
            >
                {trigger}
            </button>
            {isOpen ? (
                <Panel
                    id={menuId}
                    variant="glass"
                    compact
                    className={`ev-menu__popover ev-menu__popover--${align}`}
                    role="menu"
                    aria-label={label}
                >
                    {children(close)}
                </Panel>
            ) : null}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Chips, pills, badges                                                        */
/* -------------------------------------------------------------------------- */

export type ChipTone = 'neutral' | 'good' | 'info' | 'warn' | 'bad' | 'gene'

export function Chip({ tone = 'neutral', icon, children, className = '' }: { tone?: ChipTone; icon?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <span className={`ev-chip ${tone === 'neutral' ? '' : `ev-chip--${tone}`} ${className}`}>
            {icon ? <span className="ev-chip__icon" aria-hidden="true">{icon}</span> : null}
            <span className="ev-truncate">{children}</span>
        </span>
    )
}

export function Pill({ icon, children, className = '' }: { icon?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <span className={`ev-pill ${className}`}>
            {icon ? <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center' }}>{icon}</span> : null}
            {children}
        </span>
    )
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <span className={`ev-badge ${className}`}>{children}</span>
}

export function SectionLabel({ children, tone = 'light', className = '' }: { children: ReactNode; tone?: 'light' | 'ink'; className?: string }) {
    return <p className={`ev-section-label ${tone === 'ink' ? 'ev-section-label--ink' : ''} ${className}`}><span>{children}</span></p>
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({ name, src, size, className = '', style }: { name: string; src?: string | null; size?: number; className?: string; style?: React.CSSProperties }) {
    return (
        <span
            className={`ev-avatar ${className}`}
            role="img"
            aria-label={`Avatar di ${name}`}
            style={{ ...style, ...(size ? { ['--ev-avatar-size' as string]: `${size}px` } : null) }}
        >
            <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
            {src ? <img src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
        </span>
    )
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An avatar wearing its own experience: the progress is a ring around the portrait and the level
 * sits on the rim, so the whole of "who you are and how far along you are" costs one round object
 * instead of a portrait plus a bar plus a caption.
 *
 * The ring is a masked conic gradient rather than an SVG arc — it follows `--ev-avatar-size` with
 * no arc-length arithmetic, and there is no stroke to keep in step with the border the avatar
 * already draws.
 */
export function AvatarProgress({ name, src, size, level, current, total, label }: {
    name: string
    src?: string | null
    size?: number
    level?: number
    current: number
    total: number
    /** Names the progress for assistive tech, e.g. "Esperienza 120 su 400". */
    label: string
}) {
    const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0

    return (
        <span
            className="ev-avatar-progress"
            style={{
                ['--ev-ring-ratio' as string]: ratio,
                ...(size ? { ['--ev-avatar-size' as string]: `${size}px` } : null),
            }}
        >
            <span
                className="ev-avatar-progress__ring"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={current}
                aria-label={label}
            />
            {/* Size is inherited through `--ev-avatar-size`, so the portrait fills the ring's core. */}
            <Avatar name={name} src={src} />
            {level === undefined ? null : (
                <strong className="ev-avatar-progress__level" aria-label={`Livello ${level}`}>{level}</strong>
            )}
        </span>
    )
}

export function ProgressBar({ current, total, tone = 'green', label }: { current: number; total: number; tone?: 'green' | 'gold'; label?: string }) {
    const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0

    return (
        <div
            className={`ev-progress ${tone === 'gold' ? 'ev-progress--gold' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={current}
            aria-label={label}
        >
            <div className="ev-progress__fill" style={{ width: `${ratio * 100}%` }} />
        </div>
    )
}

export function Pips({ total, filled, color, label, size = 'md' }: { total: number; filled: number; color?: string; label: string; size?: 'md' | 'compact' }) {
    return (
        <span className={`ev-pips ${size === 'compact' ? 'ev-pips--compact' : ''}`} role="img" aria-label={label} style={color ? { ['--ev-pip-color' as string]: color } : undefined}>
            {Array.from({ length: total }, (_, index) => (
                <span key={index} className={`ev-pips__dot ${index < filled ? 'is-on' : ''}`} />
            ))}
        </span>
    )
}

/* -------------------------------------------------------------------------- */
/* Overlay + sheet                                                             */
/* -------------------------------------------------------------------------- */

type OverlayProps = {
    label: string
    onClose?: () => void
    align?: 'end' | 'center'
    children: ReactNode
    closeOnBackdrop?: boolean
    /**
     * `panel` backs a cream sheet, which carries its own contrast. `scene` is for content that
     * sits straight on the artwork: it defocuses the scene harder but tints it less, so the layer
     * reads as part of the game rather than as a page opening on top of it.
     */
    scrim?: 'panel' | 'scene'
    /** `narrow` stops short of the app width so the scene stays visible down both sides. */
    width?: 'app' | 'narrow'
}

/**
 * Modal layer rendered into the document body, with Escape and backdrop dismissal.
 *
 * An overlay belongs to the screen that opened it. Because it portals to the body it sits outside
 * that screen's animating layer, so it cannot leave with it — it would hang at full opacity over
 * the arriving screen and then blink out. It therefore closes the moment its screen starts leaving.
 */
export function Overlay({
    label,
    onClose,
    align = 'end',
    children,
    closeOnBackdrop = true,
    scrim = 'panel',
    width = 'app',
}: OverlayProps) {
    const contentRef = useRef<HTMLDivElement>(null)
    const isScreenLeaving = useIsScreenLeaving()

    useEffect(() => {
        if (isScreenLeaving) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        contentRef.current?.focus()

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && onClose) {
                event.preventDefault()
                onClose()
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isScreenLeaving, onClose])

    if (isScreenLeaving) {
        return null
    }

    return createPortal(
        <div
            className={`ev-overlay ${align === 'center' ? 'ev-overlay--center' : ''} ${scrim === 'scene' ? 'ev-overlay--scene' : ''}`}
            role="presentation"
            onPointerDown={closeOnBackdrop && onClose ? (event) => { if (event.target === event.currentTarget) onClose() } : undefined}
        >
            <div
                ref={contentRef}
                className={`ev-sheet ${width === 'narrow' ? 'ev-sheet--narrow' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
            >
                {children}
            </div>
        </div>,
        document.body,
    )
}

export function SheetHeader({ eyebrow, title, onClose }: { eyebrow?: string; title: string; onClose?: () => void }) {
    return (
        <header className="ev-sheet__header">
            <div className="ev-sheet__title">
                {eyebrow ? <span className="ev-eyebrow">{eyebrow}</span> : null}
                <h2>{title}</h2>
            </div>
            {onClose ? (
                <IconButton label="Chiudi" variant="cream" onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            ) : null}
        </header>
    )
}

type ConfirmDialogProps = {
    /** Accessible name of the dialog, e.g. "Conferma uscita dalla partita". */
    label: string
    title: string
    description: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
    onCancel: () => void
}

/**
 * "Are you sure?" for anything the player cannot undo — abandoning a match, signing out.
 *
 * One component rather than one per screen, because the point of asking is that the player learns
 * the shape of the question: the same red mark, the same two stacked buttons in the same order,
 * wherever it appears. Cancel is the second button and the roomier target of the two on purpose.
 */
export function ConfirmDialog({ label, title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <Overlay label={label} align="center" onClose={onCancel}>
            <Panel className="ev-confirm">
                <span className="ev-confirm__mark" aria-hidden="true"><CloseIcon /></span>
                <h2>{title}</h2>
                <p>{description}</p>
                <div className="ev-confirm__actions">
                    <Button tone="danger" block onClick={onConfirm}>{confirmLabel}</Button>
                    <Button tone="cream" block onClick={onCancel}>{cancelLabel}</Button>
                </div>
            </Panel>
        </Overlay>
    )
}

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

export function Notice({ tone, children }: { tone: 'success' | 'warning' | 'error'; children: ReactNode }) {
    return (
        <p
            className={`ev-notice ev-notice--${tone}`}
            role={tone === 'success' ? 'status' : 'alert'}
            aria-live={tone === 'success' ? 'polite' : 'assertive'}
        >
            {children}
        </p>
    )
}
