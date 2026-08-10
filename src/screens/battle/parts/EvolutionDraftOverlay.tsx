import { useEffect, useState } from 'react'

import { EVOLUTION_TARGET_BY_ID } from '../../../../shared/creature-transformations/evolution-targets.ts'
import type { EvolutionTargetId } from '../../../../shared/creature-transformations/evolution-targets.ts'
import { fetchEvolutionTargetProgress, type EvolutionTargetProgressRecord } from '../../../lib/evolution-progress-api'
import { Notice, Overlay, ProgressBar } from '../../../ui/components'
import { CrossroadsIcon, EvolutionTargetIcon } from '../../../ui/icons'

type EvolutionDraftOverlayProps = {
    options: readonly EvolutionTargetId[]
    creatureId?: string | null
    onChoose: (evolutionTargetId: EvolutionTargetId) => Promise<void>
}

/**
 * Battle-start draft.
 *
 * The player commits to one of two anatomical targets before the first round; winning the match
 * credits a win to that target's counter. Each option shows where that counter currently stands,
 * so the choice is informed. The choice is sent to the server immediately and cannot be changed,
 * so the overlay blocks the battle until it succeeds.
 */
export function EvolutionDraftOverlay({ options, creatureId, onChoose }: EvolutionDraftOverlayProps) {
    const [pendingTargetId, setPendingTargetId] = useState<EvolutionTargetId | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [progress, setProgress] = useState<EvolutionTargetProgressRecord[] | null>(null)

    useEffect(() => {
        if (!creatureId) {
            setProgress([])

            return
        }

        let active = true

        // The counters are informative: a failure must not block the draft.
        void fetchEvolutionTargetProgress(creatureId)
            .then((records) => { if (active) setProgress(records) })
            .catch(() => { if (active) setProgress([]) })

        return () => { active = false }
    }, [creatureId])

    async function choose(evolutionTargetId: EvolutionTargetId) {
        if (pendingTargetId) {
            return
        }

        setPendingTargetId(evolutionTargetId)
        setErrorMessage(null)

        try {
            await onChoose(evolutionTargetId)
        } catch (error) {
            setPendingTargetId(null)
            setErrorMessage(error instanceof Error ? error.message : 'Non e stato possibile registrare la scelta.')
        }
    }

    return (
        // No panel: the draft is a layer over the battlefield, not a page on top of it. The two
        // option cards are the only solid surfaces; everything else sits on the blurred scene.
        <Overlay label="Scegli il tratto da far evolvere" align="center" scrim="scene" width="narrow">
            <div className="evolution-draft">
                <span className="evolution-draft__mark" aria-hidden="true"><CrossroadsIcon /></span>
                <span className="ev-eyebrow ev-eyebrow--light">Prima del primo round</span>
                <h2>Su quale tratto punti?</h2>
                <p className="evolution-draft__copy">
                    Vinci la partita e questo tratto avanza di una vittoria. Se perdi o pareggi, non avanza nulla.
                </p>

                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

                <div className="evolution-draft__options" role="group" aria-label="Tratti proposti">
                    {options.map((evolutionTargetId) => {
                        const target = EVOLUTION_TARGET_BY_ID[evolutionTargetId]
                        const counter = progress?.find((entry) => entry.evolutionTargetId === evolutionTargetId)

                        return (
                            <button
                                key={evolutionTargetId}
                                type="button"
                                className={`evolution-draft__option ${pendingTargetId === evolutionTargetId ? 'is-pending' : ''}`}
                                disabled={Boolean(pendingTargetId)}
                                aria-label={counter
                                    ? `${target.label}: ${counter.wins} vittorie su ${counter.target}. ${target.description}`
                                    : `${target.label}. ${target.description}`}
                                onClick={() => void choose(evolutionTargetId)}
                            >
                                <span className="evolution-draft__glyph" aria-hidden="true">
                                    <EvolutionTargetIcon target={evolutionTargetId} />
                                </span>
                                <strong className="evolution-draft__label">{target.label}</strong>
                                <small className="evolution-draft__description">{target.description}</small>
                                <span className="evolution-draft__counter">
                                    {counter ? (
                                        <>
                                            <ProgressBar
                                                current={Math.min(counter.wins, counter.target)}
                                                total={counter.target}
                                                tone={counter.wins >= counter.target ? 'gold' : 'green'}
                                                label={`${counter.wins} vittorie su ${counter.target}`}
                                            />
                                            <b>{counter.wins} / {counter.target}</b>
                                        </>
                                    ) : (
                                        <b className="evolution-draft__counter--pending">&nbsp;</b>
                                    )}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {pendingTargetId ? <p className="evolution-draft__pending" role="status">Registrazione della scelta...</p> : null}
            </div>
        </Overlay>
    )
}
