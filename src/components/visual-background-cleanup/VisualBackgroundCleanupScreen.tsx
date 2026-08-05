import { useCallback, useEffect, useRef, useState } from 'react'

import { listVisualBackgroundCleanup, submitVisualBackgroundCleanup } from '../../lib/creature-transformations-api'
import { removeCreatureBackground } from '../../lib/remove-creature-background'

import './VisualBackgroundCleanupScreen.css'

type CleanupEntry = { visualVersionId: string; creatureId: string; profileId: string; versionNumber: number; signedUrl: string; expiresAt: string }
type Result = { visualVersionId: string; state: 'DONE' | 'FAILED'; message: string }
type Props = { onBack: () => void; onVisualChanged: () => Promise<void> | void }

function pngBytesToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    return btoa(binary)
}

export function VisualBackgroundCleanupScreen({ onBack, onVisualChanged }: Props) {
    const [entries, setEntries] = useState<CleanupEntry[]>([])
    const [results, setResults] = useState<Result[]>([])
    const [loading, setLoading] = useState(true)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [currentEntry, setCurrentEntry] = useState<CleanupEntry | null>(null)
    const [currentStep, setCurrentStep] = useState<string | null>(null)
    const stopRequested = useRef(false)

    const refresh = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const response = await listVisualBackgroundCleanup()
            setEntries(response.entries)
        } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Impossibile caricare le visuali da ripulire.') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { void refresh() }, [refresh])

    async function processAll() {
        setRunning(true); setError(null); setResults([]); stopRequested.current = false
        const localResults: Result[] = []
        for (const entry of entries) {
            if (stopRequested.current) break
            setCurrentEntry(entry)
            try {
                setCurrentStep('Download del PNG sorgente...')
                const response = await fetch(entry.signedUrl)
                if (!response.ok) throw new Error('Download della sorgente non riuscito.')
                setCurrentStep('Caricamento del modello di scontorno ad alta qualita: il primo avvio puo richiedere piu tempo...')
                const transparent = await removeCreatureBackground(await response.blob())
                setCurrentStep('Validazione e attivazione del PNG trasparente...')
                const pngBytes = new Uint8Array(await transparent.arrayBuffer())
                await submitVisualBackgroundCleanup({ operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP', visualVersionId: entry.visualVersionId, candidatePngBase64: pngBytesToBase64(pngBytes) })
                localResults.push({ visualVersionId: entry.visualVersionId, state: 'DONE', message: 'Versione trasparente attivata.' })
            } catch (nextError) {
                localResults.push({ visualVersionId: entry.visualVersionId, state: 'FAILED', message: nextError instanceof Error ? nextError.message : 'Elaborazione non riuscita.' })
            }
            setResults([...localResults])
        }
        setCurrentEntry(null); setCurrentStep(null)
        setRunning(false)
        if (localResults.some((result) => result.state === 'DONE')) await onVisualChanged()
    }

    const completed = results.filter((result) => result.state === 'DONE').length
    return <section className="visual-background-cleanup" aria-labelledby="visual-background-cleanup-title">
        <header><button type="button" onClick={onBack}>← Profilo</button><div><span className="eyebrow">Manutenzione visuali</span><h1 id="visual-background-cleanup-title">Pulizia sfondi</h1></div></header>
        {error ? <p className="visual-background-cleanup__error" role="alert">{error}</p> : null}
        {loading ? <p>Caricamento visuali…</p> : <>
            <section className="visual-background-cleanup__summary"><strong>{entries.length}</strong><span>visuali da elaborare</span><button type="button" disabled={running || !entries.length} onClick={() => void processAll()}>{running ? `Elaborazione ${results.length + 1} / ${entries.length}` : 'Processa tutte'}</button>{running ? <button type="button" onClick={() => { stopRequested.current = true }}>Interrompi</button> : <button type="button" onClick={() => void refresh()}>Ricarica</button>}</section>
            {currentEntry && currentStep ? <p className="visual-background-cleanup__current" role="status">Creatura {currentEntry.creatureId.slice(0, 8)} · v{currentEntry.versionNumber}: {currentStep}</p> : null}
            {results.length ? <p className="visual-background-cleanup__progress" role="status">Completate: {completed}. Non riuscite: {results.length - completed}.</p> : null}
            <ol className="visual-background-cleanup__list">{entries.map((entry) => { const result = results.find((item) => item.visualVersionId === entry.visualVersionId); const isCurrent = currentEntry?.visualVersionId === entry.visualVersionId; return <li key={entry.visualVersionId}><span>Creatura {entry.creatureId.slice(0, 8)} · v{entry.versionNumber}</span><strong className={result?.state === 'FAILED' ? 'is-failed' : result?.state === 'DONE' ? 'is-done' : ''}>{result?.message ?? (isCurrent ? 'Elaborazione in corso...' : 'In attesa')}</strong></li> })}</ol>
        </>}
    </section>
}