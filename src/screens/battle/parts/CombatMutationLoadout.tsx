import { IconButton } from '../../../ui/components'
import { BoltIcon, EyeIcon, MeteorIcon, ShieldCheckIcon, SparkIcon } from '../../../ui/icons'
import type { CombatMutationSlotV2 } from '../controller/types'

type CombatMutationLoadoutProps = {
    mutations: CombatMutationSlotV2[]
    onActivateSymbiosis?: () => void
    onActivateFineDelMondo?: () => void
}

function mutationStatusLabel(status: CombatMutationSlotV2['status']): string {
    if (status === 'armed') {
        return 'Attiva'
    }

    if (status === 'consumed') {
        return 'Consumata'
    }

    if (status === 'linked') {
        return 'Collegata'
    }

    return 'Disponibile'
}

function MutationIcon({ iconKey }: { iconKey: CombatMutationSlotV2['iconKey'] }) {
    switch (iconKey) {
        case 'elastic-limbs':
            return <BoltIcon />
        case 'adaptive-core':
            return <EyeIcon />
        case 'armored-memory':
            return <ShieldCheckIcon />
        case 'fine-del-mondo':
            return <MeteorIcon />
        default:
            return <SparkIcon />
    }
}

function getMutationActivation(mutation: CombatMutationSlotV2, onActivateSymbiosis?: () => void, onActivateFineDelMondo?: () => void): (() => void) | undefined {
    if (mutation.id === 'SYMBIOSIS') {
        return onActivateSymbiosis
    }

    if (mutation.id === 'FINE_DEL_MONDO') {
        return onActivateFineDelMondo
    }

    return undefined
}

export function CombatMutationLoadout({ mutations, onActivateSymbiosis, onActivateFineDelMondo }: CombatMutationLoadoutProps) {
    if (!mutations.length) {
        return null
    }

    return (
        <section className="mutation-loadout" aria-label="Mutazioni equipaggiate">
            <span className="mutation-loadout__label">Mutazioni</span>
            <div className="mutation-loadout__items" role="list">
                {mutations.map((mutation) => {
                    const stateLabel = mutationStatusLabel(mutation.status)
                    const label = `${mutation.label}, ${stateLabel.toLowerCase()}. ${mutation.shortDescription}${mutation.linkLabel ? ` ${mutation.linkLabel}.` : ''}`
                    const activate = getMutationActivation(mutation, onActivateSymbiosis, onActivateFineDelMondo)
                    const canActivate = mutation.status === 'available' && activate

                    return (
                        <div key={mutation.id} className={`mutation-slot mutation-slot--${mutation.status}`} role="listitem">
                            {canActivate ? (
                                <IconButton label={`Attiva ${mutation.label}`} className="mutation-slot__icon" onClick={activate}>
                                    <MutationIcon iconKey={mutation.iconKey} />
                                </IconButton>
                            ) : (
                                <span className="mutation-slot__icon" title={label} aria-label={label}>
                                    <MutationIcon iconKey={mutation.iconKey} />
                                </span>
                            )}
                            <span className="mutation-slot__copy">
                                <strong className="ev-truncate" title={mutation.label}>{mutation.label}</strong>
                                <span className="mutation-slot__state">
                                    <i aria-hidden="true" />
                                    {stateLabel}
                                </span>
                                {mutation.linkLabel ? <small className="ev-truncate" title={mutation.linkLabel}>{mutation.linkLabel}</small> : null}
                            </span>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
