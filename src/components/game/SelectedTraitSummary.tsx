type SelectedTraitSummaryProps = {
    title: string
    detail: string
}

export function SelectedTraitSummary({ title, detail }: SelectedTraitSummaryProps) {
    return (
        <section className="selected-trait-summary" aria-live="polite">
            <strong>{title}</strong>
            <span>{detail}</span>
        </section>
    )
}