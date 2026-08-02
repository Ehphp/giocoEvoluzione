import { useState } from 'react'

import {
    TRANSFORMATION_INTENSITIES,
    VISUAL_TRAIT_BY_ID,
    VISUAL_TRAITS,
    type GenerateConceptResponse,
    type TransformationIntensity,
    type VisualTraitId,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createConceptIdempotencyKey,
    CreatureTransformationApiError,
    generateCreatureTransformationConcept,
} from '../../lib/creature-transformations-api'

import './CreatureTransformationLab.css'

type ConceptMode = 'MOCK' | 'AI'

type CreatureTransformationLabProps = {
    creature: PlayerCreatureRecord
    onBack: () => void
}

function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
}

export function CreatureTransformationLab({ creature, onBack }: CreatureTransformationLabProps) {
    const [visualTraitId, setVisualTraitId] = useState<VisualTraitId>(VISUAL_TRAITS[0].id)
    const [intensity, setIntensity] = useState<TransformationIntensity>(2)
    const [conceptMode, setConceptMode] = useState<ConceptMode>('MOCK')
    const [result, setResult] = useState<GenerateConceptResponse | null>(null)
    const [error, setError] = useState<CreatureTransformationApiError | Error | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const visualTrait = VISUAL_TRAIT_BY_ID[visualTraitId]

    async function handleGenerate() {
        setIsLoading(true)
        setError(null)

        try {
            const nextResult = await generateCreatureTransformationConcept({
                operation: 'GENERATE_CONCEPT',
                creatureId: creature.id,
                visualTraitId,
                intensity,
                conceptMode,
                idempotencyKey: createConceptIdempotencyKey(),
            })
            setResult(nextResult)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Generazione concept non riuscita.'))
        } finally {
            setIsLoading(false)
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
                    <small>Anteprima sorgente statica - concept-only</small>
                    {result ? <p>{result.identity.description}</p> : null}
                </div>
            </section>

            <section className="creature-transformation-lab__controls" aria-label="Configurazione concept">
                <label>
                    Visual Trait
                    <select value={visualTraitId} onChange={(event) => setVisualTraitId(event.target.value as VisualTraitId)} disabled={isLoading}>
                        {VISUAL_TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.displayName}</option>)}
                    </select>
                </label>
                <p className="creature-transformation-lab__trait-description">{visualTrait.description}</p>
                <label>
                    Intensita
                    <select value={intensity} onChange={(event) => setIntensity(Number(event.target.value) as TransformationIntensity)} disabled={isLoading}>
                        {TRANSFORMATION_INTENSITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label>
                    Concept Generator
                    <select value={conceptMode} onChange={(event) => setConceptMode(event.target.value as ConceptMode)} disabled={isLoading}>
                        <option value="MOCK">MOCK - nessun costo</option>
                        <option value="AI">AI - server-side</option>
                    </select>
                </label>
                <button type="button" className="primary-button" onClick={() => void handleGenerate()} disabled={isLoading}>
                    {isLoading ? 'Genero concept...' : 'Genera concept'}
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

            {result ? (
                <section className="creature-transformation-lab__result" aria-live="polite">
                    <header>
                        <div><span>Request</span><strong>{result.requestId}</strong></div>
                        <div><span>Generator</span><strong>{result.generation.generator}{result.generation.isMock ? ' (mock)' : ''}</strong></div>
                        {result.generation.model ? <div><span>Modello</span><strong>{result.generation.model}</strong></div> : null}
                        <div><span>Tentativi</span><strong>{result.generation.attempts}</strong></div>
                        <div><span>Latenza</span><strong>{result.generation.latencyMs} ms</strong></div>
                    </header>

                    <section className="creature-transformation-lab__evaluation">
                        <h2>Valutazione</h2>
                        <p><strong>Identity risk:</strong> {result.evaluation.identityRisk}</p>
                        <p><strong>Transformation strength:</strong> {result.evaluation.transformationStrength}</p>
                        {result.evaluation.problems.length ? <ul>{result.evaluation.problems.map((problem) => <li key={`${problem.code}-${problem.path ?? ''}`}>{problem.code}: {problem.message}</li>)}</ul> : <p>Nessun warning qualitativo.</p>}
                    </section>

                    <details open><summary>Concept JSON</summary><pre>{formatJson(result.concept)}</pre></details>
                    <details><summary>Prompt finale</summary><pre>{result.prompt.prompt}</pre></details>
                </section>
            ) : null}
        </section>
    )
}
