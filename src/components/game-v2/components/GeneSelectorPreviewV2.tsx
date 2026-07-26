import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BASE_USE_VALUE } from '../../../game/config'
import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection?: boolean
}

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
    isSelected,
    isPredictionOpen,
    isSide,
    isVisible,
    disabled,
    tabIndex,
    onClick,
    onKeyDown,
}: {
    gene: GeneCardV2
    isSelected: boolean
    isPredictionOpen: boolean
    isSide: boolean
    isVisible: boolean
    disabled: boolean
    tabIndex: number
    onClick: () => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
    const [imageFailed, setImageFailed] = useState(false)
    const prediction = gene.prediction ?? {
        useScore: BASE_USE_VALUE + gene.level,
        eventContribution: 0,
    }
    const eventLabel = `Evento ${formatContribution(prediction.eventContribution)}`

    return (
        <button
            type="button"
            role="option"
            className={`selector-v2-card selector-v2-card--${gene.traitType.toLowerCase().replaceAll('_', '-')} ${isSelected ? 'is-selected' : ''} ${isSide ? 'is-side' : ''} ${isVisible ? 'is-visible' : 'is-outside'} ${gene.usable ? '' : 'is-cooldown'}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}, ${prediction.useScore} punti previsti, ${eventLabel}${gene.usable ? '' : `, ${gene.disabledReason ?? 'non disponibile'}`}${isSelected ? `. Tocca per ${isPredictionOpen ? 'chiudere' : 'vedere'} i dettagli` : ''}`}
            aria-expanded={isSelected ? isPredictionOpen : undefined}
            aria-describedby={isPredictionOpen ? 'gene-prediction-details' : undefined}
            tabIndex={tabIndex}
            onClick={onClick}
            onKeyDown={onKeyDown}
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
                <span className="selector-v2-points">{prediction.useScore} PT</span>
                <span className={`selector-v2-event-modifier ${prediction.eventContribution > 0 ? 'is-positive' : prediction.eventContribution < 0 ? 'is-negative' : 'is-neutral'}`}>
                    {eventLabel}
                </span>
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
    const swipeStartXRef = useRef<number | null>(null)
    const ignoreClickRef = useRef(false)
    const previousOrderRef = useRef(genes.map((gene) => gene.id).join('|'))
    const orderSignature = genes.map((gene) => gene.id).join('|')
    const railStart = Math.min(
        Math.max(0, selectedIndex - 1),
        Math.max(0, total - 3),
    )
    const visibleSlots = Math.min(3, total)
    const railWidth = (total / visibleSlots) * 100
    const cardWidth = 100 / total
    const railOffset = -(railStart / total) * 100

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

    function handleCardClick(gene: GeneCardV2, geneIndex: number) {
        if (ignoreClickRef.current) {
            ignoreClickRef.current = false

            return
        }

        if (geneIndex === selectedIndex) {
            setPreviewGeneId((current) => current === gene.id ? null : gene.id)
        } else {
            selectByIndex(geneIndex)
        }
    }

    function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            selectByOffset(-1)
        } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            selectByOffset(1)
        } else if (event.key === 'Home') {
            event.preventDefault()
            selectByIndex(0)
        } else if (event.key === 'End') {
            event.preventDefault()
            selectByIndex(total - 1)
        }
    }

    function handleSwipeStart(event: ReactPointerEvent<HTMLDivElement>) {
        swipeStartXRef.current = event.clientX
    }

    function handleSwipeEnd(event: ReactPointerEvent<HTMLDivElement>) {
        if (swipeStartXRef.current === null) {
            return
        }

        const distance = event.clientX - swipeStartXRef.current
        swipeStartXRef.current = null

        if (Math.abs(distance) < 42) {
            return
        }

        ignoreClickRef.current = true
        selectByOffset(distance < 0 ? 1 : -1)
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

            <div
                className="selector-v2-carousel"
                role="listbox"
                aria-label="Card geni, da più forte a più debole"
                onPointerDown={handleSwipeStart}
                onPointerUp={handleSwipeEnd}
                onPointerCancel={() => {
                    swipeStartXRef.current = null
                }}
            >
                <div
                    className="selector-v2-rail"
                    style={{
                        '--rail-start': String(railStart),
                        '--rail-width': `${railWidth}%`,
                        '--rail-card-width': `${cardWidth}%`,
                        '--rail-offset': `${railOffset}%`,
                    } as CSSProperties}
                >
                    {genes.map((gene, geneIndex) => (
                        <GeneCard
                            key={gene.id}
                            gene={gene}
                            isSelected={geneIndex === selectedIndex}
                            isPredictionOpen={gene.id === previewGeneId}
                            isSide={geneIndex !== selectedIndex}
                            isVisible={geneIndex >= railStart && geneIndex < railStart + 3}
                            disabled={disableSelection}
                            tabIndex={geneIndex === selectedIndex ? 0 : -1}
                            onClick={() => handleCardClick(gene, geneIndex)}
                            onKeyDown={handleCardKeyDown}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}
