import { useEffect, useMemo, useRef, useState } from 'react'
import { BASE_USE_VALUE } from '../../../game/config'
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

function formatContribution(value: number): string {
    return value > 0 ? `+${value}` : String(value)
}

function GenePredictionPopover({ gene }: { gene: GeneCardV2 }) {
    const prediction = gene.prediction ?? {
        useScore: BASE_USE_VALUE + gene.level,
        baseContribution: BASE_USE_VALUE,
        levelContribution: gene.level,
        eventContribution: 0,
        reasons: [],
    }

    return (
        <aside id="gene-prediction-details" className="selector-v2-popover" role="tooltip" aria-live="polite">
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
                <span>Base <strong>{formatContribution(prediction.baseContribution)}</strong></span>
                <span>Livello <strong>{formatContribution(prediction.levelContribution)}</strong></span>
                <span>Evento <strong>{formatContribution(prediction.eventContribution)}</strong></span>
            </div>
            <p>
                {prediction.reasons[0]
                    ?? (prediction.eventContribution === 0
                        ? 'Questo evento non modifica il rendimento del gene.'
                        : 'Il punteggio include il modificatore dell evento.')}
            </p>
            <small className="selector-v2-popover__hint">Tocca di nuovo il gene o fuori dal pannello per chiudere</small>
        </aside>
    )
}

function GeneCard({
    gene,
    buttonRef,
    isSelected,
    isPredictionOpen,
    isSide,
    disabled,
    onClick,
}: {
    gene: GeneCardV2
    buttonRef: (element: HTMLButtonElement | null) => void
    isSelected: boolean
    isPredictionOpen: boolean
    isSide: boolean
    disabled: boolean
    onClick: () => void
}) {
    const [imageFailed, setImageFailed] = useState(false)

    return (
        <button
            ref={buttonRef}
            type="button"
            role="option"
            className={`selector-v2-card selector-v2-card--${gene.traitType.toLowerCase().replaceAll('_', '-')} ${isSelected ? 'is-selected' : ''} ${isSide ? 'is-side' : ''} ${gene.usable ? '' : 'is-cooldown'}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}${isSelected ? `. Tocca per ${isPredictionOpen ? 'chiudere' : 'vedere'} la previsione del punteggio` : ''}`}
            aria-expanded={isSelected ? isPredictionOpen : undefined}
            aria-describedby={isPredictionOpen ? 'gene-prediction-details' : undefined}
            onClick={onClick}
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
    const selectorRef = useRef<HTMLElement | null>(null)
    const previousOrderRef = useRef(genes.map((gene) => gene.id).join('|'))
    const cardRefs = useRef(new Map<string, HTMLButtonElement>())
    const orderSignature = genes.map((gene) => gene.id).join('|')
    const visibleIndices = useMemo(() => {
        const visibleCount = Math.min(VISIBLE_CARD_COUNT, total)
        const selectedSlot = Math.floor(visibleCount / 2)
        const start = Math.min(
            Math.max(0, selectedIndex - selectedSlot),
            Math.max(0, total - visibleCount),
        )

        // Keep the slider linear from strongest to weakest. The selected gene
        // occupies the visual focal point whenever there are cards on both
        // sides; at either end the list remains naturally ordered.
        return Array.from({ length: visibleCount }, (_, slot) => start + slot)
    }, [selectedIndex, total])

    useEffect(() => {
        closePrediction()
    }, [selectedGeneId])

    useEffect(() => {
        if (disableSelection) {
            closePrediction()
        }
    }, [disableSelection])

    useEffect(() => {
        if (!previewGeneId) {
            return
        }

        function handleOutsidePointerDown(event: PointerEvent) {
            if (!selectorRef.current?.contains(event.target as Node)) {
                closePrediction()
            }
        }

        document.addEventListener('pointerdown', handleOutsidePointerDown, true)

        return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
    }, [previewGeneId])

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

    function closePrediction() {
        setPreviewGeneId(null)
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
            ref={selectorRef}
            className={`selector-v2 ${isReordering ? 'is-reordering' : ''}`}
            aria-label="Selettore geni ordinato dal gene più forte al più debole"
        >
            {previewGene ? <GenePredictionPopover gene={previewGene} /> : null}

            <div className="selector-v2-header">
                <strong>SCEGLI UN GENE</strong>
                <span className="selector-v2-sr-only">Gene {selectedIndex + 1} di {total}</span>
            </div>

            <div className="selector-v2-carousel" role="listbox" aria-label="Card geni, da più forte a più debole">
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
                                isPredictionOpen={gene.id === previewGeneId}
                                isSide={geneIndex !== selectedIndex}
                                disabled={disableSelection}
                                onClick={() => {
                                    if (geneIndex === selectedIndex) {
                                        setPreviewGeneId((current) => current === gene.id ? null : gene.id)
                                    } else {
                                        selectByIndex(geneIndex)
                                    }
                                }}
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

            <span className="selector-v2-hold-hint">
                Tocca il gene selezionato per punteggio e dettagli
            </span>

            <div className="selector-v2-dots" role="group" aria-label="Scelta rapida gene">
                {genes.map((gene, index) => (
                    <button
                        key={gene.id}
                        type="button"
                        aria-current={index === selectedIndex ? 'true' : undefined}
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
