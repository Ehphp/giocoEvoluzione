import { useEffect, useMemo, type KeyboardEvent } from 'react'

import { CREATURE_ASSETS } from '../../game/config'
import { getTraitRoundValue } from '../../game/engine'
import { getRoundEventEffectsForTrait } from '../../game/round-events'
import { TRAIT_CATALOG } from '../../game/traits-catalog'
import { getTraitTradeoffMock } from '../../game/ui-context'
import type { RoundEventDefinition, TraitCollection, TraitType } from '../../game/types'

type TraitSelectorProps = {
    traits: TraitCollection
    selectedTrait: TraitType | null
    currentRoundEvent: RoundEventDefinition | null
    onSelectTrait: (trait: TraitType) => void
    isSubmitted: boolean
}

function getAffinityText(affinity: number): string {
    if (affinity === 3) {
        return 'Alta affinita'
    }

    if (affinity === 2) {
        return 'Buona affinita'
    }

    if (affinity === 1) {
        return 'Affinita limitata'
    }

    return 'Affinita neutra'
}

function getCardClass(affinity: number): string {
    if (affinity === 3) {
        return 'trait-selector__button--high'
    }

    if (affinity === 2) {
        return 'trait-selector__button--mid'
    }

    if (affinity === 1) {
        return 'trait-selector__button--low'
    }

    return 'trait-selector__button--none'
}

function getColumnJump(): number {
    if (window.innerWidth >= 390) {
        return 5
    }

    if (window.innerWidth >= 360) {
        return 4
    }

    return 3
}

export function TraitSelector({
    traits,
    selectedTrait,
    currentRoundEvent,
    onSelectTrait,
    isSubmitted,
}: TraitSelectorProps) {
    const orderedTraits = useMemo(() => {
        const keys = Object.keys(traits) as TraitType[]

        return keys.sort((a, b) => TRAIT_CATALOG[a].displayOrder - TRAIT_CATALOG[b].displayOrder)
    }, [traits])

    const activeTrait = selectedTrait ?? orderedTraits[0] ?? null

    useEffect(() => {
        if (!selectedTrait && orderedTraits[0] && !isSubmitted) {
            onSelectTrait(orderedTraits[0])
        }
    }, [isSubmitted, onSelectTrait, orderedTraits, selectedTrait])

    function selectByOffset(offset: number) {
        if (!activeTrait || isSubmitted) {
            return
        }

        const activeIndex = Math.max(0, orderedTraits.indexOf(activeTrait))
        const nextIndex = Math.min(orderedTraits.length - 1, Math.max(0, activeIndex + offset))
        const nextTrait = orderedTraits[nextIndex]

        if (nextTrait && nextTrait !== activeTrait) {
            onSelectTrait(nextTrait)
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (isSubmitted) {
            return
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault()
            selectByOffset(1)
            return
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            selectByOffset(-1)
            return
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            selectByOffset(getColumnJump())
            return
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            selectByOffset(-getColumnJump())
            return
        }

        if (event.key === 'Home' && orderedTraits[0]) {
            event.preventDefault()
            onSelectTrait(orderedTraits[0])
            return
        }

        if (event.key === 'End' && orderedTraits[orderedTraits.length - 1]) {
            event.preventDefault()
            onSelectTrait(orderedTraits[orderedTraits.length - 1])
        }
    }

    if (!activeTrait) {
        return null
    }

    const activeState = traits[activeTrait]
    const activeMetadata = TRAIT_CATALOG[activeTrait]
    const activeAffinity = currentRoundEvent
        ? getRoundEventEffectsForTrait(currentRoundEvent, activeTrait).reduce((sum, effect) => sum + effect.modifier, 0)
        : 0
    const activeUseValue = currentRoundEvent ? getTraitRoundValue(currentRoundEvent, traits, activeTrait) : null
    const activeAvailability = activeState.cooldown > 0 ? `In cooldown per ${activeState.cooldown} round` : 'Disponibile per USE'
    const activeTradeoff = getTraitTradeoffMock(activeTrait)

    return (
        <section className="trait-selector-panel" aria-label="Selettore geni">
            <header className="trait-selector-panel__header">
                <div>
                    <strong>Catalogo geni</strong>
                    <span>Tutti i geni visibili, confronto immediato di livello e affinita.</span>
                </div>
                <span className="trait-selector-panel__count">{orderedTraits.length} geni</span>
            </header>

            <div className="trait-selector-grid" role="listbox" aria-label="Tutti i geni disponibili">
                {orderedTraits.map((trait) => {
                    const state = traits[trait]
                    const metadata = TRAIT_CATALOG[trait]
                    const isSelected = trait === activeTrait
                    const affinity = currentRoundEvent
                        ? getRoundEventEffectsForTrait(currentRoundEvent, trait).reduce((sum, effect) => sum + effect.modifier, 0)
                        : 0
                    const useValue = currentRoundEvent ? getTraitRoundValue(currentRoundEvent, traits, trait) : null
                    const iconSrc = CREATURE_ASSETS[trait]
                    const availabilityText = state.cooldown > 0 ? `Cooldown ${state.cooldown}` : 'Ready'

                    return (
                        <button
                            key={trait}
                            type="button"
                            role="option"
                            className={`trait-selector__button ${getCardClass(affinity)} ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => onSelectTrait(trait)}
                            onKeyDown={handleKeyDown}
                            aria-selected={isSelected}
                            aria-label={`${metadata.label}, livello ${state.level}, ${getAffinityText(affinity)}, USE previsto ${useValue ?? 'non disponibile'}, ${availabilityText}`}
                            disabled={isSubmitted}
                        >
                            <span className="trait-selector__tile-top">
                                <span className="trait-selector__icon-wrap" aria-hidden="true">
                                    <img
                                        src={iconSrc}
                                        alt=""
                                        className="trait-selector__icon"
                                        onError={(event) => {
                                            event.currentTarget.style.display = 'none'
                                        }}
                                    />
                                    <span className="trait-selector__fallback">{metadata.label.slice(0, 2).toUpperCase()}</span>
                                </span>
                                <span className="trait-selector__level">Lv {state.level}</span>
                            </span>

                            <strong>{metadata.label}</strong>

                            <span className="trait-selector__tile-meta">
                                <span className={`trait-selector__affinity trait-selector__affinity--${affinity >= 3 ? 'high' : affinity >= 2 ? 'mid' : affinity >= 1 ? 'low' : 'none'}`}>
                                    {affinity}/3
                                </span>
                                <span className="trait-selector__state">{availabilityText}</span>
                            </span>

                            <span className="trait-selector__use-preview">USE {useValue ?? 'n/d'}</span>
                        </button>
                    )
                })}
            </div>

            <section className="trait-selector__detail-card" aria-live="polite">
                <div key={activeTrait} className="trait-selector__detail-body">
                    <div className="trait-selector__detail-header">
                        <div>
                            <span className="trait-selector__detail-eyebrow">Gene selezionato</span>
                            <strong>{activeMetadata.label}</strong>
                        </div>
                        <span className="trait-selector__detail-level">Livello {activeState.level}</span>
                    </div>

                    <p className="trait-selector__detail-description">{activeMetadata.description}</p>

                    <div className="trait-selector__detail-facts">
                        <article>
                            <span>Affinita</span>
                            <strong>{activeAffinity}/3</strong>
                            <small>{getAffinityText(activeAffinity)}</small>
                        </article>
                        <article>
                            <span>USE previsto</span>
                            <strong>{activeUseValue ?? 'n/d'}</strong>
                            <small>Valore del round se usi ora</small>
                        </article>
                        <article>
                            <span>Disponibilita</span>
                            <strong>{activeAvailability}</strong>
                            <small>{activeState.cooldown > 0 ? 'USE non disponibile in questo round' : 'USE attivo subito'}</small>
                        </article>
                        <article>
                            <span>EVOLVE</span>
                            <strong>Livello {activeState.level + 1}</strong>
                            <small>Upgrade valido dai round successivi</small>
                        </article>
                    </div>

                    {activeTradeoff ? (
                        <div className="trait-selector__detail-extras">
                            <span>{activeTradeoff.survivalShift}</span>
                            <span>{activeTradeoff.unlockedResource}</span>
                            <span>{activeTradeoff.compromise}</span>
                        </div>
                    ) : null}
                </div>
            </section>
        </section>
    )
}