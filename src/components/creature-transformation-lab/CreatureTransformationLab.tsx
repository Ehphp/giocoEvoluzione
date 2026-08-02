import { useState } from 'react'

import {
    TRANSFORMATION_INTENSITIES,
    VISUAL_TRAIT_BY_ID,
    VISUAL_TRAITS,
    type GenerateConceptResponse,
    type GenerateImageResponse,
    type TransformationIntensity,
    type VisualTraitId,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    CreatureTransformationApiError,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
} from '../../lib/creature-transformations-api'
import { canGenerateMockImage } from './lab-image-state'

import './CreatureTransformationLab.css'

type ConceptMode = 'MOCK' | 'AI'

type CreatureTransformationLabProps = {
    creature: PlayerCreatureRecord
    onBack: () => void
}

function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
}

function shortHash(sha256: string): string {
    return `${sha256.slice(0, 12)}…${sha256.slice(-8)}`
}

export function CreatureTransformationLab({ creature, onBack }: CreatureTransformationLabProps) {
    const [visualTraitId, setVisualTraitId] = useState<VisualTraitId>(VISUAL_TRAITS[0].id)
    const [intensity, setIntensity] = useState<TransformationIntensity>(2)
    const [conceptMode, setConceptMode] = useState<ConceptMode>('MOCK')
    const [conceptResult, setConceptResult] = useState<GenerateConceptResponse | null>(null)
    const [imageResult, setImageResult] = useState<GenerateImageResponse | null>(null)
    const [error, setError] = useState<CreatureTransformationApiError | Error | null>(null)
    const [isGeneratingConcept, setIsGeneratingConcept] = useState(false)
    const [isGeneratingImage, setIsGeneratingImage] = useState(false)
    const visualTrait = VISUAL_TRAIT_BY_ID[visualTraitId]
    const isBusy = isGeneratingConcept || isGeneratingImage
    const imageGenerationAvailable = canGenerateMockImage(conceptResult, isGeneratingConcept, isGeneratingImage)

    function invalidateConceptAndImage() {
        setConceptResult(null)
        setImageResult(null)
        setError(null)
    }

    async function handleGenerateConcept() {
        setIsGeneratingConcept(true)
        setError(null)
        setImageResult(null)

        try {
            const nextResult = await generateCreatureTransformationConcept({
                operation: 'GENERATE_CONCEPT',
                creatureId: creature.id,
                visualTraitId,
                intensity,
                conceptMode,
                idempotencyKey: createConceptIdempotencyKey(),
            })
            setConceptResult(nextResult)
        } catch (nextError) {
            setConceptResult(null)
            setError(nextError instanceof Error ? nextError : new Error('Generazione concept non riuscita.'))
        } finally {
            setIsGeneratingConcept(false)
        }
    }

    async function handleGenerateImage() {
        if (!conceptResult || !imageGenerationAvailable) return

        setIsGeneratingImage(true)
        setError(null)
        try {
            const nextResult = await generateCreatureTransformationImage({
                operation: 'GENERATE_IMAGE',
                creatureId: creature.id,
                concept: conceptResult.concept,
                imageProviderMode: 'MOCK',
                idempotencyKey: createImageIdempotencyKey(),
            })
            setImageResult(nextResult)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Generazione immagine mock non riuscita.'))
        } finally {
            setIsGeneratingImage(false)
        }
    }

    return (
        <section className="creature-transformation-lab" aria-labelledby="creature-transformation-lab-title">
            <header className="creature-transformation-lab__header">
                <button type="button" onClick={onBack}>{'<- Home'}</button>
                <div>
                    <span className="eyebrow">Development-only</span>
                    <h1 id="creature-transformation-lab-title">Laboratorio trasformazioni</h1>
                </div>
            </header>

            <section className="creature-transformation-lab__identity" aria-label="Creatura autenticata">
                <img src="/assets/battle/creatures/verdant-hatchling.png" alt="Anteprima del drago sorgente" />
                <div>
                    <span>Creatura autenticata</span>
                    <strong>{creature.name ?? 'Creatura iniziale'}</strong>
                    <small>Anteprima browser della stessa creatura base usata dal source canonico server-side.</small>
                    {conceptResult ? <p>{conceptResult.identity.description}</p> : null}
                </div>
            </section>

            <section className="creature-transformation-lab__controls" aria-label="Configurazione concept">
                <label>
                    Visual Trait
                    <select value={visualTraitId} onChange={(event) => { setVisualTraitId(event.target.value as VisualTraitId); invalidateConceptAndImage() }} disabled={isBusy}>
                        {VISUAL_TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.displayName}</option>)}
                    </select>
                </label>
                <p className="creature-transformation-lab__trait-description">{visualTrait.description}</p>
                <label>
                    Intensita
                    <select value={intensity} onChange={(event) => { setIntensity(Number(event.target.value) as TransformationIntensity); invalidateConceptAndImage() }} disabled={isBusy}>
                        {TRANSFORMATION_INTENSITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label>
                    Concept Generator
                    <select value={conceptMode} onChange={(event) => { setConceptMode(event.target.value as ConceptMode); invalidateConceptAndImage() }} disabled={isBusy}>
                        <option value="MOCK">MOCK - nessun costo</option>
                        <option value="AI">AI - server-side</option>
                    </select>
                </label>
                <button type="button" className="primary-button" onClick={() => void handleGenerateConcept()} disabled={isBusy}>
                    {isGeneratingConcept ? 'Genero concept...' : 'Genera concept'}
                </button>
            </section>

            {error ? (
                <section className="creature-transformation-lab__error" role="alert">
                    <strong>{error instanceof CreatureTransformationApiError ? error.code : 'Errore richiesta'}</strong>
                    <p>{error.message}</p>
                    {error instanceof CreatureTransformationApiError && error.problems?.length ? (
                        <ul>{error.problems.map((problem) => <li key={`${problem.code}-${problem.path ?? ''}`}>{problem.code}: {problem.message}</li>)}</ul>
                    ) : null}
                </section>
            ) : null}

            {conceptResult ? (
                <section className="creature-transformation-lab__result" aria-live="polite">
                    <header>
                        <div><span>Request</span><strong>{conceptResult.requestId}</strong></div>
                        <div><span>Generator</span><strong>{conceptResult.generation.generator}{conceptResult.generation.isMock ? ' (mock)' : ''}</strong></div>
                        {conceptResult.generation.model ? <div><span>Modello</span><strong>{conceptResult.generation.model}</strong></div> : null}
                        <div><span>Tentativi</span><strong>{conceptResult.generation.attempts}</strong></div>
                        <div><span>Latenza</span><strong>{conceptResult.generation.latencyMs} ms</strong></div>
                    </header>

                    <section className="creature-transformation-lab__evaluation">
                        <h2>Valutazione</h2>
                        <p><strong>Identity risk:</strong> {conceptResult.evaluation.identityRisk}</p>
                        <p><strong>Transformation strength:</strong> {conceptResult.evaluation.transformationStrength}</p>
                        {conceptResult.evaluation.problems.length ? <ul>{conceptResult.evaluation.problems.map((problem) => <li key={`${problem.code}-${problem.path ?? ''}`}>{problem.code}: {problem.message}</li>)}</ul> : <p>Nessun warning qualitativo.</p>}
                    </section>

                    <section className="creature-transformation-lab__image-controls" aria-label="Generazione immagine mock">
                        <label>
                            Image provider mode
                            <select value="MOCK" disabled><option value="MOCK">MOCK - simulazione tecnica</option></select>
                        </label>
                        <button type="button" className="primary-button" onClick={() => void handleGenerateImage()} disabled={!imageGenerationAvailable}>
                            {isGeneratingImage ? 'Genero immagine mock...' : 'Genera immagine mock'}
                        </button>
                    </section>

                    <details open><summary>Concept JSON</summary><pre>{formatJson(conceptResult.concept)}</pre></details>
                    <details><summary>Prompt finale</summary><pre>{conceptResult.prompt.prompt}</pre></details>
                </section>
            ) : null}

            {imageResult ? (
                <section className="creature-transformation-lab__image-result" aria-live="polite">
                    <div className="creature-transformation-lab__mock-banner">Mock: nessuna trasformazione visiva applicata</div>
                    <div className="creature-transformation-lab__image-compare">
                        <figure><img src="/assets/battle/creatures/verdant-hatchling.png" alt="Sorgente canonica della creatura" /><figcaption>Sorgente: anteprima browser della creatura base</figcaption></figure>
                        <figure><img src={imageResult.result.signedUrl} alt="Risultato mock della trasformazione" /><figcaption>Risultato: byte della sorgente restituiti dal provider mock</figcaption></figure>
                    </div>
                    <dl className="creature-transformation-lab__image-metadata">
                        <div><dt>Request ID</dt><dd>{imageResult.requestId}</dd></div>
                        <div><dt>Provider</dt><dd>{imageResult.generation.provider}</dd></div>
                        <div><dt>Model</dt><dd>{imageResult.generation.model}</dd></div>
                        <div><dt>isMock</dt><dd>{String(imageResult.generation.isMock)}</dd></div>
                        <div><dt>Latenza</dt><dd>{imageResult.generation.latencyMs} ms</dd></div>
                        <div><dt>Costo</dt><dd>${imageResult.generation.estimatedCostUsd ?? 0}</dd></div>
                        <div><dt>Dimensioni</dt><dd>{imageResult.result.width} × {imageResult.result.height}</dd></div>
                        <div><dt>SHA-256</dt><dd title={imageResult.result.sha256}>{shortHash(imageResult.result.sha256)}</dd></div>
                        <div><dt>Scadenza URL</dt><dd>{new Date(imageResult.result.expiresAt).toLocaleString()}</dd></div>
                    </dl>
                    {imageResult.validation.warnings.length ? <ul className="creature-transformation-lab__warnings">{imageResult.validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                </section>
            ) : null}
        </section>
    )
}
