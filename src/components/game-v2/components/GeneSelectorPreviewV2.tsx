import { useEffect, useMemo, useRef, useState } from 'react'
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

const VISIBLE_CARD_COUNT = 3
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
    buttonRef,
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
    buttonRef: (element: HTMLButtonElement | null) => void
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
            ref={buttonRef}
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
    const [isReordering, setIsReordering] = useState(false)
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const previousOrderRef = useRef(genes.map((gene) => gene.id).join('|'))
    const cardRefs = useRef(new Map<string, HTMLButtonElement>())
    const orderSignature = genes.map((gene) => gene.id).join('|')
    const visibleIndices = useMemo(() => {
        const visibleCount = Math.min(VISIBLE_CARD_COUNT, total)
        const start = Math.min(
            Math.max(0, selectedIndex - 1),
            Math.max(0, total - visibleCount),
        )

        return Array.from({ length: visibleCount }, (_, index) => start + index)
    }, [selectedIndex, total])

    useEffect(() => () => clearHoldTimer(), [])

    useEffect(() => {
        closePrediction()
    }, [selectedGeneId])

    useEffect(() => {
        const selectedCard = cardRefs.current.get(selectedGeneId)

        selectedCard?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
        })
    }, [orderSignature, selectedGeneId])

    useEffect(() => {
        if (previousOrderRef.current === orderSignature) {
            return
        }

        previousOrderRef.current = orderSignature
        setIsReordering(true)
        const timer = setTimeout(() => setIsReordering(false), 260)

        return () => clearTimeout(timer)
    }, [orderSignature])

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

    function selectByOffset(offset: number) {
        if (disableSelection) {
            return
        }

        const nextIndex = Math.min(total - 1, Math.max(0, selectedIndex + offset))
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
        <section
            className={`selector-v2 ${isReordering ? 'is-reordering' : ''}`}
            aria-label="Selettore geni ordinato dal gene più debole al più forte"
        >
            {previewGene ? <GenePredictionPopover gene={previewGene} /> : null}

            <div className="selector-v2-header">
                <strong>SCEGLI UN GENE</strong>
                <span className="selector-v2-sr-only">Gene {selectedIndex + 1} di {total}</span>
            </div>

            <div className="selector-v2-carousel" role="listbox" aria-label="Card geni, da più debole a più forte">
                <button
                    type="button"
                    className="selector-v2-arrow selector-v2-arrow--prev"
                    onClick={() => selectByOffset(-1)}
                    aria-label="Gene precedente"
                    disabled={disableSelection || selectedIndex === 0}
                >
                    ‹
                </button>

                <div className="selector-v2-rail">
                    {visibleIndices.map((geneIndex) => {
                        const gene = genes[geneIndex]

                        return (
                            <GeneCard
                                key={gene.id}
                                gene={gene}
                                buttonRef={(element) => {
                                    if (element) {
                                        cardRefs.current.set(gene.id, element)
                                    } else {
                                        cardRefs.current.delete(gene.id)
                                    }
                                }}
                                isSelected={geneIndex === selectedIndex}
                                isSide={geneIndex !== selectedIndex}
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
                    disabled={disableSelection || selectedIndex === total - 1}
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
