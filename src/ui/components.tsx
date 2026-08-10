import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { CloseIcon } from './icons'

import './components.css'

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

type AppShellProps = {
    /** Painted backdrop rendered behind every layer. */
    sceneryUrl: string
    sceneryFallbackUrl?: string
    children: ReactNode
    dock?: ReactNode
    scroll?: boolean
    className?: string
}

export function AppShell({ sceneryUrl, sceneryFallbackUrl, children, dock, scroll = false, className = '' }: AppShellProps) {
    return (
        <div className={`ev-shell ${dock ? 'ev-shell--docked' : ''} ${className}`}>
            <img
                className="ev-shell__scenery"
                src={sceneryUrl}
                alt=""
                onError={(event) => {
                    if (sceneryFallbackUrl && event.currentTarget.src !== sceneryFallbackUrl) {
                        event.currentTarget.src = sceneryFallbackUrl
                    }
                }}
            />
            <div className="ev-shell__wash" aria-hidden="true" />
            <div className={`ev-shell__content ${scroll ? 'ev-shell__content--scroll' : ''}`}>{children}</div>
            {dock}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

type PanelProps = {
    variant?: 'cream' | 'glass'
    flat?: boolean
    className?: string
    children: ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

export function Panel({ variant = 'cream', flat = false, className = '', children, ...rest }: PanelProps) {
    return (
        <div className={`ev-panel ev-panel--${variant} ${flat ? 'ev-panel--flat' : ''} ${className}`} {...rest}>
            {children}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

export type ButtonTone = 'use' | 'evolve' | 'gold' | 'info' | 'cream' | 'ghost' | 'danger'

type ButtonProps = {
    tone?: ButtonTone
    block?: boolean
    size?: 'md' | 'sm'
    className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ tone = 'use', block = false, size = 'md', className = '', type = 'button', children, ...rest }: ButtonProps) {
    return (
        <button
            type={type}
            className={`ev-btn ev-btn--${tone} ${block ? 'ev-btn--block' : ''} ${size === 'sm' ? 'ev-btn--sm' : ''} ${className}`}
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
} & ButtonHTMLAttributes<HTMLButtonElement>

/** Large two-line call to action used for the round decision. */
export function ActionButton({ tone, title, hint, value, glyph, className = '', ...rest }: ActionButtonProps) {
    return (
        <button type="button" className={`ev-btn ev-btn--${tone} ev-action-btn ${className}`} {...rest}>
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
} & ButtonHTMLAttributes<HTMLButtonElement>

/**
 * Circular icon-only control. `danger` is the single exit/logout treatment used across the app.
 */
export function IconButton({ label, variant = 'glass', size = 'md', className = '', children, ...rest }: IconButtonProps) {
    return (
        <button
            type="button"
            className={`ev-icon-btn ${variant === 'glass' ? '' : `ev-icon-btn--${variant}`} ${size === 'lg' ? 'ev-icon-btn--lg' : ''} ${className}`}
            aria-label={label}
            title={label}
            {...rest}
        >
            {children}
        </button>
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

export function Pips({ total, filled, color, label }: { total: number; filled: number; color?: string; label: string }) {
    return (
        <span className="ev-pips" role="img" aria-label={label} style={color ? { ['--ev-pip-color' as string]: color } : undefined}>
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

/** Modal layer rendered into the document body, with Escape and backdrop dismissal. */
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

    useEffect(() => {
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
    }, [onClose])

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
