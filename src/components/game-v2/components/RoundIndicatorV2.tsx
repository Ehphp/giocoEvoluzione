import type { RoundInfoV2 } from '../types'

type RoundIndicatorV2Props = {
    round: RoundInfoV2
}

export function RoundIndicatorV2({ round }: RoundIndicatorV2Props) {
    return (
        <section className="gene-v2-round-indicator" aria-label={`Round ${round.current} su ${round.total}`}>
            <span>ROUND</span>
            <strong>
                {round.current} / {round.total}
            </strong>
        </section>
    )
}
