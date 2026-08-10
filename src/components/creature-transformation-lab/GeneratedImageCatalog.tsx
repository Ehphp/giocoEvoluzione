import { useCallback, useEffect, useState } from 'react'

import type { GeneratedImageCatalogResponse } from '../../../shared/creature-transformations/index.ts'
import { getGeneratedImageCatalog } from '../../lib/creature-transformations-api'
import { CloseIcon, CollectionIcon } from '../../ui/icons'

type CatalogEntry = GeneratedImageCatalogResponse['entries'][number]

type GeneratedImageCatalogProps = {
    onClose: () => void
}

function formatDate(value: string | null): string {
    if (!value) return 'Data non disponibile'
    return new Date(value).toLocaleString('it-IT')
}

function entryLabel(entry: CatalogEntry): string {
    return `${entry.imageProviderMode ?? 'Immagine'} · ${formatDate(entry.completedAt ?? entry.createdAt)}`
}

export function GeneratedImageCatalog({ onClose }: GeneratedImageCatalogProps) {
    const [page, setPage] = useState(0)
    const [response, setResponse] = useState<GeneratedImageCatalogResponse | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const load = useCallback(async (nextPage: number) => {
        setIsLoading(true)
        setError(null)
        try {
            const nextResponse = await getGeneratedImageCatalog({ operation: 'GET_GENERATED_IMAGE_CATALOG', ...(nextPage ? { page: nextPage } : {}) })
            setPage(nextResponse.page)
            setResponse(nextResponse)
            setSelectedId(nextResponse.entries[0]?.transformationRequestId ?? null)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Impossibile caricare il catalogo delle immagini.')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { void load(0) }, [load])

    const selected = response?.entries.find((entry) => entry.transformationRequestId === selectedId) ?? null

    return <section className="creature-transformation-lab__generated-catalog" aria-labelledby="generated-image-catalog-title">
        <header>
            <div>
                <span className="eyebrow">ARCHIVIO GENERAZIONI</span>
                <h2 id="generated-image-catalog-title"><CollectionIcon aria-hidden="true" />Catalogo immagini e prompt</h2>
                <p>Archivio privato delle immagini completate dal tuo profilo. I link alle immagini sono temporanei e creati dal server.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Chiudi catalogo immagini"><CloseIcon aria-hidden="true" />Chiudi</button>
        </header>

        {isLoading ? <p role="status">Caricamento delle generazioni…</p> : null}
        {error ? <p className="creature-transformation-lab__catalog-error" role="alert">{error}</p> : null}
        {!isLoading && !error && response?.entries.length === 0 ? <p>Nessuna immagine generata disponibile in questo archivio.</p> : null}

        {response?.entries.length ? <div className="creature-transformation-lab__generated-catalog-content">
            <div className="creature-transformation-lab__generated-catalog-grid" role="list" aria-label="Immagini generate">
                {response.entries.map((entry) => <button
                    key={entry.transformationRequestId}
                    type="button"
                    role="listitem"
                    className={entry.transformationRequestId === selectedId ? 'is-selected' : ''}
                    aria-pressed={entry.transformationRequestId === selectedId}
                    onClick={() => setSelectedId(entry.transformationRequestId)}
                >
                    <img src={entry.result.signedUrl} alt={`Risultato generato: ${entryLabel(entry)}`} />
                    <span>{entry.imageProviderMode ?? 'Immagine'}</span>
                    <small>{formatDate(entry.completedAt ?? entry.createdAt)}</small>
                </button>)}
            </div>

            {selected ? <article className="creature-transformation-lab__generated-catalog-detail" aria-live="polite">
                <figure><img src={selected.result.signedUrl} alt={`Anteprima estesa: ${entryLabel(selected)}`} /><figcaption>{entryLabel(selected)}</figcaption></figure>
                <dl>
                    <div><dt>Provider</dt><dd>{selected.provider ?? 'Non disponibile'}</dd></div>
                    <div><dt>Modello</dt><dd>{selected.model ?? 'Non disponibile'}</dd></div>
                    <div><dt>Asset</dt><dd>{selected.assetReadiness ?? 'Non disponibile'}</dd></div>
                    <div><dt>Dimensioni</dt><dd>{selected.result.width} × {selected.result.height}</dd></div>
                </dl>
                <details open>
                    <summary>Prompt usato</summary>
                    {selected.prompt ? <><pre>{selected.prompt.text}</pre><small title={selected.prompt.sha256 ?? undefined}>SHA-256: {selected.prompt.sha256 ?? 'non disponibile'}</small></> : <p>Il prompt non è disponibile per questa generazione precedente.</p>}
                </details>
            </article> : null}
        </div> : null}

        <nav className="creature-transformation-lab__generated-catalog-pagination" aria-label="Pagine del catalogo">
            <button type="button" onClick={() => void load(page - 1)} disabled={isLoading || page === 0}>Precedenti</button>
            <span>Pagina {page + 1}</span>
            <button type="button" onClick={() => void load(page + 1)} disabled={isLoading || !response?.hasMore}>Successive</button>
        </nav>
    </section>
}
