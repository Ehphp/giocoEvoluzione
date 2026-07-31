import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = { genes: GeneCardV2[]; selectedGeneId: string; onSelectGene: (geneId: string) => void; disableSelection?: boolean }

function formatContribution(value: number): string { return value > 0 ? `+${value}` : String(value) }
function affinityLabel(gene: GeneCardV2): string { return gene.affinity === 'ideal' ? 'Ideale' : gene.affinity === 'suitable' ? 'Adatto' : 'Sfavorevole' }

function GenePredictionPopover({ gene, onClose }: { gene: GeneCardV2; onClose: () => void }) {
    const prediction = gene.prediction
    if (!prediction) {
        return (
            <aside id="gene-prediction-details" className="selector-v2-popover" role="tooltip" aria-live="polite">
                <button type="button" className="selector-v2-popover__close" onClick={onClose} aria-label="Chiudi dettagli previsione">Ã—</button>
                <p>Valore ambientale non disponibile.</p>
            </aside>
        )
    }
    return (
        <aside id="gene-prediction-details" className="selector-v2-popover" role="tooltip" aria-live="polite">
            <button type="button" className="selector-v2-popover__close" onClick={onClose} aria-label="Chiudi dettagli previsione">×</button>
            <div className="selector-v2-popover__header"><div><span>Valore ambientale · {gene.usable ? 'Disponibile' : 'Esaurito'}</span><strong>{gene.name}</strong></div><b aria-label={`Valore ambientale ${prediction.useScore}`}>{prediction.useScore}<small> pt</small></b></div>
            <div className="selector-v2-popover__breakdown" aria-label="Calcolo del valore ambientale"><span>Base <strong>{formatContribution(prediction.baseContribution)}</strong></span><span>Livello <strong>{formatContribution(prediction.levelContribution)}</strong></span><span>Affinita <strong>{affinityLabel(gene)} ({formatContribution(prediction.eventModifier)})</strong></span></div>
            <p>{prediction.reasons[0] ?? 'Il valore include base, livello e affinita; il matchup avversario resta nascosto.'}</p>
            <p>Forte contro {gene.strongAgainst}; teme {gene.weakAgainst}.</p>
        </aside>
    )
}

function GeneCard({ gene, isSelected, isPredictionOpen, disabled, tabIndex, onClick, onKeyDown }: { gene: GeneCardV2; isSelected: boolean; isPredictionOpen: boolean; disabled: boolean; tabIndex: number; onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
    const [imageFailed, setImageFailed] = useState(false)
    const prediction = gene.prediction
    const eventLabel = `Affinita ${affinityLabel(gene)}`
    const predictionLabel = prediction ? String(prediction.useScore) : 'non disponibile'
    return (
        <button type="button" role="option" className={`selector-v2-card selector-v2-card--${gene.traitType.toLowerCase().replaceAll('_', '-')} ${isSelected ? 'is-selected' : ''} ${gene.exhausted ? 'is-exhausted' : ''}`} aria-selected={isSelected} aria-label={`${gene.name}, livello ${gene.level}, ${gene.usable ? 'disponibile' : 'esaurito'}, valore ambientale ${predictionLabel}, ${eventLabel}, forte contro ${gene.strongAgainst}, teme ${gene.weakAgainst}${isSelected ? `. Tocca per ${isPredictionOpen ? 'chiudere' : 'vedere'} i dettagli` : ''}`} aria-expanded={isSelected ? isPredictionOpen : undefined} aria-describedby={isPredictionOpen ? 'gene-prediction-details' : undefined} title={gene.name} tabIndex={tabIndex} onClick={onClick} onKeyDown={onKeyDown} disabled={disabled}>
            <div className="selector-v2-icon" aria-hidden="true">{gene.imageUrl && !imageFailed ? <img src={gene.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <span>{gene.name.slice(0, 2).toUpperCase()}</span>}</div>
            <strong className="selector-v2-name">{gene.name}</strong>
            <span className="selector-v2-level">Liv. {gene.level}</span>
            <span className="selector-v2-points"><small>USA</small>{prediction ? `${prediction.useScore} PT` : '— PT'}</span>
            <span className="selector-v2-availability">{gene.usable ? 'Usabile' : 'In cooldown'}</span>
        </button>
    )
}

export function GeneSelectorPreviewV2({ genes, selectedGeneId, onSelectGene, disableSelection = false }: GeneSelectorPreviewV2Props) {
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId)); const [previewGeneId, setPreviewGeneId] = useState<string | null>(null); const selectorRef = useRef<HTMLElement | null>(null)
    useEffect(() => { setPreviewGeneId(null) }, [selectedGeneId, disableSelection])
    useEffect(() => { if (!previewGeneId) return; const handleOutsidePointerDown = (event: PointerEvent) => { if (!selectorRef.current?.contains(event.target as Node)) setPreviewGeneId(null) }; document.addEventListener('pointerdown', handleOutsidePointerDown, true); return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true) }, [previewGeneId])
    if (!genes.length) return null
    const selectByIndex = (index: number) => { if (disableSelection || index < 0 || index >= genes.length || index === selectedIndex) return; setPreviewGeneId(null); onSelectGene(genes[index]!.id) }
    const handleCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => { if (event.key === 'ArrowLeft') { event.preventDefault(); selectByIndex(selectedIndex - 1) } else if (event.key === 'ArrowRight') { event.preventDefault(); selectByIndex(selectedIndex + 1) } else if (event.key === 'Home') { event.preventDefault(); selectByIndex(0) } else if (event.key === 'End') { event.preventDefault(); selectByIndex(genes.length - 1) } else if (event.key === 'Escape') setPreviewGeneId(null) }
    const previewGene = previewGeneId ? genes.find((gene) => gene.id === previewGeneId) ?? null : null
    return <section ref={selectorRef} className="selector-v2" aria-label="Selettore adattamenti">{previewGene ? <GenePredictionPopover gene={previewGene} onClose={() => setPreviewGeneId(null)} /> : null}<div className="selector-v2-header"><strong>SCEGLI UN ADATTAMENTO</strong></div><div className="selector-v2-grid" role="listbox" aria-label="Cinque adattamenti disponibili">{genes.map((gene, geneIndex) => <GeneCard key={gene.id} gene={gene} isSelected={geneIndex === selectedIndex} isPredictionOpen={gene.id === previewGeneId} disabled={disableSelection} tabIndex={geneIndex === selectedIndex ? 0 : -1} onClick={() => { if (geneIndex === selectedIndex) setPreviewGeneId((current) => current === gene.id ? null : gene.id); else selectByIndex(geneIndex) }} onKeyDown={handleCardKeyDown} />)}</div></section>
}
