type PhaseTone = 'default' | 'warning' | 'danger' | 'success'

type PhaseBannerProps = {
    message: string
    detail?: string | null
    tone?: PhaseTone
}

export function PhaseBanner({ message, detail, tone = 'default' }: PhaseBannerProps) {
    return (
        <section className={`phase-banner phase-banner--${tone}`} aria-live="polite">
            <strong>{message}</strong>
            {detail ? <span>{detail}</span> : null}
        </section>
    )
}