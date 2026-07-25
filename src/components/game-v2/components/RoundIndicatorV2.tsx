import type { RoundInfoV2 } from '../types'

type RoundIndicatorV2Props = {
    round: RoundInfoV2
}

export function RoundIndicatorV2({ round }: RoundIndicatorV2Props) {
    return (
        <section className="round-v2-indicator" aria-label={`Round ${round.current} su ${round.total}`}>
            <span className="round-v2-pill">
                ROUND <strong>{round.current}/{round.total}</strong>
            </span>
        </section>
    )
}
