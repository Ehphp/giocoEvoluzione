import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection?: boolean
}

function affinityLabel(affinity: GeneCardV2['affinity']): string {
    if (affinity === 'excellent') {
        return 'Ottimo'
    }

    if (affinity === 'high') {
        return 'Buono'
    }

    if (affinity === 'medium') {
        return 'Adatto'
    }

    return 'Bassa affinità'
}

function wrapIndex(index: number, total: number): number {
    if (total === 0) {
        return 0
    }

    return (index + total) % total
}

const VISIBLE_CARD_OFFSETS = [-1, 0, 1]
const HOLD_DELAY_MS = 240

function formatContribution(value: number): string {
    return value > 0 ? `+${value}` : String(value)
}

function GenePredictionPopover({ gene }: { gene: GeneCardV2 }) {
    const prediction = gene.prediction ?? {
        useScore: gene.level,
        levelContribution: gene.level,
        eventContribution: 0,
        reasons: [],
    }

    return (
        <aside className="selector-v2-popover" role="tooltip" aria-live="polite">
            <div className="selector-v2-popover__header">
                <div>
                    <span>
                        Previsione uso · {gene.usable ? 'Disponibile' : (gene.disabledReason ?? 'Non disponibile')}
                    </span>
                    <strong>{gene.name}</strong>
                </div>
                <b aria-label={`Punteggio previsto ${prediction.useScore}`}>
                    {prediction.useScore}
                    <small> pt</small>
                </b>
            </div>
            <div className="selector-v2-popover__breakdown" aria-label="Calcolo del punteggio previsto">
                <span>Livello <strong>{formatContribution(prediction.levelContribution)}</strong></span>
                <span>Evento <strong>{formatContribution(prediction.eventContribution)}</strong></span>
            </div>
            <p>
                {prediction.reasons[0]
                    ?? (prediction.eventContribution === 0
                        ? 'Questo evento non modifica il rendimento del gene.'
                        : 'Il punteggio include il modificatore dell evento.')}
            </p>
            <small className="selector-v2-popover__hint">Rilascia per chiudere</small>
        </aside>
    )
}

function GeneCard({
    gene,
    isSelected,
    isSide,
    disabled,
    onClick,
    onHoldStart,
    onHoldEnd,
    onPredictionKeyDown,
    onPredictionKeyUp,
}: {
    gene: GeneCardV2
    isSelected: boolean
    isSide: boolean
    disabled: boolean
    onClick: () => void
    onHoldStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
    onHoldEnd: () => void
    onPredictionKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
    onPredictionKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
    const [imageFailed, setImageFailed] = useState(false)

    return (
        <button
            type="button"
            role="option"
            className={`selector-v2-card selector-v2-card--${gene.traitType.toLowerCase().replaceAll('_', '-')} ${isSelected ? 'is-selected' : ''} ${isSide ? 'is-side' : ''} ${gene.usable ? '' : 'is-cooldown'}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}${isSelected ? '. Tieni premuto per la previsione del punteggio' : ''}`}
            onClick={onClick}
            onPointerDown={onHoldStart}
            onPointerUp={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onPointerCancel={onHoldEnd}
            onKeyDown={onPredictionKeyDown}
            onKeyUp={onPredictionKeyUp}
            onContextMenu={(event) => {
                if (isSelected) {
                    event.preventDefault()
                }
            }}
            disabled={disabled}
        >
            <div className="selector-v2-icon" role="img" aria-label={`Icona gene ${gene.name}`}>
                {gene.imageUrl && !imageFailed ? (
                    <img
                        src={gene.imageUrl}
                        alt=""
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <span aria-hidden="true">{gene.name.slice(0, 2).toUpperCase()}</span>
                )}
            </div>
            <strong className="selector-v2-name">{gene.name}</strong>
            <div className="selector-v2-meta">
                <span className="selector-v2-level">
                    <small>LV</small>
                    <b>{gene.level}</b>
                </span>
                <span className={`selector-v2-affinity is-${gene.affinity}`}>{affinityLabel(gene.affinity)}</span>
            </div>
            {!gene.usable ? <span className="selector-v2-cooldown">{gene.disabledReason}</span> : null}
        </button>
    )
}

export function GeneSelectorPreviewV2({ genes, selectedGeneId, onSelectGene, disableSelection = false }: GeneSelectorPreviewV2Props) {
    const total = genes.length
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))
    const [previewGeneId, setPreviewGeneId] = useState<string | null>(null)
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => clearHoldTimer(), [])

    useEffect(() => {
        closePrediction()
    }, [selectedGeneId])

    function clearHoldTimer() {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current)
            holdTimerRef.current = null
        }
    }

    function closePrediction() {
        clearHoldTimer()
        setPreviewGeneId(null)
    }

    function startPredictionHold(gene: GeneCardV2, event: ReactPointerEvent<HTMLButtonElement>) {
        if (gene.id !== selectedGeneId || event.button !== 0) {
            return
        }

        clearHoldTimer()
        holdTimerRef.current = setTimeout(() => {
            setPreviewGeneId(gene.id)
            holdTimerRef.current = null
        }, HOLD_DELAY_MS)
    }

    function handlePredictionKeyDown(gene: GeneCardV2, event: KeyboardEvent<HTMLButtonElement>) {
        if (gene.id !== selectedGeneId || (event.key !== 'Enter' && event.key !== ' ')) {
            return
        }

        clearHoldTimer()
        setPreviewGeneId(gene.id)
    }

    function handlePredictionKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === 'Enter' || event.key === ' ') {
            closePrediction()
        }
    }

    if (total === 0) {
        return null
    }

    const visibleOffsets = total >= VISIBLE_CARD_OFFSETS.length
        ? VISIBLE_CARD_OFFSETS
        : Array.from({ length: total }, (_, index) => index - selectedIndex)

    function selectByOffset(offset: number) {
        if (disableSelection) {
            return
        }

        const nextIndex = wrapIndex(selectedIndex + offset, total)
        const nextGene = genes[nextIndex]

        if (nextGene && nextGene.id !== selectedGeneId) {
            closePrediction()
            onSelectGene(nextGene.id)
        }
    }

    function selectByIndex(index: number) {
        if (disableSelection || index === selectedIndex) {
            return
        }

        closePrediction()
        onSelectGene(genes[index].id)
    }

    const previewGene = previewGeneId
        ? genes.find((gene) => gene.id === previewGeneId) ?? null
        : null

    return (
        <section className="selector-v2" aria-label="Selettore geni">
            {previewGene ? <GenePredictionPopover gene={previewGene} /> : null}

            <div className="selector-v2-header">
                <strong>SCEGLI UN GENE</strong>
                <span className="selector-v2-sr-only">Gene {selectedIndex + 1} di {total}</span>
            </div>

            <div className="selector-v2-carousel" role="listbox" aria-label="Card geni">
                <button
                    type="button"
                    className="selector-v2-arrow selector-v2-arrow--prev"
                    onClick={() => selectByOffset(-1)}
                    aria-label="Gene precedente"
                    disabled={disableSelection}
                >
                    ‹
                </button>

                <div className="selector-v2-rail">
                    {visibleOffsets.map((offset) => {
                        const geneIndex = wrapIndex(selectedIndex + offset, total)
                        const gene = genes[geneIndex]

                        return (
                            <GeneCard
                                key={`${gene.id}-${offset}`}
                                gene={gene}
                                isSelected={offset === 0}
                                isSide={offset !== 0}
                                disabled={disableSelection}
                                onClick={() => selectByIndex(geneIndex)}
                                onHoldStart={(event) => startPredictionHold(gene, event)}
                                onHoldEnd={closePrediction}
                                onPredictionKeyDown={(event) => handlePredictionKeyDown(gene, event)}
                                onPredictionKeyUp={handlePredictionKeyUp}
                            />
                        )
                    })}
                </div>

                <button
                    type="button"
                    className="selector-v2-arrow selector-v2-arrow--next"
                    onClick={() => selectByOffset(1)}
                    aria-label="Gene successivo"
                    disabled={disableSelection}
                >
                    ›
                </button>
            </div>

            <span className="selector-v2-hold-hint" aria-hidden="true">
                Tieni premuto il gene selezionato per i dettagli
            </span>

            <div className="selector-v2-dots" role="tablist" aria-label="Posizione nel selettore geni">
                {genes.map((gene, index) => (
                    <button
                        key={gene.id}
                        type="button"
                        role="tab"
                        aria-selected={index === selectedIndex}
                        aria-label={`Seleziona ${gene.name}`}
                        className={`selector-v2-dot ${index === selectedIndex ? 'is-active' : ''}`}
                        onClick={() => selectByIndex(index)}
                        disabled={disableSelection}
                    />
                ))}
            </div>
        </section>
    )
}
