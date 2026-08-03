import { useMemo, useState } from 'react'

import type { GeneCardV2, GeneSelectionViewModelV2 } from './types'
import { GeneSelectionScreenV2 } from './GeneSelectionScreenV2'

const AUDIT_GENE_INPUT: ReadonlyArray<Pick<GeneCardV2, 'traitType' | 'name' | 'affinity'> & { useScore: number }> = [
    { traitType: 'FEROCITY', name: 'Ferocia', affinity: 'ideal', useScore: 3 },
    { traitType: 'ARMOR', name: 'Corazza', affinity: 'suitable', useScore: 4 },
    { traitType: 'AGILITY', name: 'Agilita', affinity: 'ideal', useScore: 2 },
    { traitType: 'SENSES', name: 'Sensi', affinity: 'unfavorable', useScore: 2 },
    { traitType: 'CAMOUFLAGE', name: 'Mimetismo', affinity: 'suitable', useScore: 3 },
]

const AUDIT_GENES: GeneCardV2[] = AUDIT_GENE_INPUT.map(({ traitType, name, affinity, useScore }, index) => ({
    id: traitType,
    traitType,
    name,
    level: 0,
    affinity,
    usable: true,
    exhausted: false,
    strongAgainst: index % 2 === 0 ? 'Corazza' : 'Sensi',
    weakAgainst: index % 2 === 0 ? 'Mimetismo' : 'Ferocia',
    prediction: { useScore, baseContribution: 2, levelContribution: 0, eventModifier: affinity === 'ideal' ? 2 : affinity === 'suitable' ? 1 : 0, reasons: ['Scenario deterministico per audit layout.'] },
}))

/** Development-only, deterministic battle scenario for browser layout checks. */
export function GameLayoutAuditScreen() {
    const [selectedGeneId, setSelectedGeneId] = useState(AUDIT_GENES[0]!.id)
    const selectedGene = AUDIT_GENES.find((gene) => gene.id === selectedGeneId) ?? AUDIT_GENES[0]!
    const viewModel = useMemo<GeneSelectionViewModelV2>(() => ({
        player: { id: 'layout-audit-local', name: 'Layout Audit Local', score: 0, roundValueTotal: 0, status: 'choosing' },
        opponent: { id: 'layout-audit-remote', name: 'Bot di verifica con nome lungo', score: 0, roundValueTotal: 0, status: 'choosing' },
        round: { current: 1, total: 7 },
        roundEvent: {
            id: 'layout-audit-event',
            title: 'Collasso risorse nutritive',
            description: 'Scarsa presenza nelle aree conosciute.',
            effects: [
                { id: 'audit-ferocity', label: 'Ferocia', modifier: 0, value: 'Sfavorevole · Ferocia', tone: 'negative' },
                { id: 'audit-armor', label: 'Corazza', modifier: 2, value: 'Ideale · Corazza', tone: 'positive' },
                { id: 'audit-agility', label: 'Agilita', modifier: 1, value: 'Adatto · Agilita', tone: 'neutral' },
            ],
        },
        nextRoundEvent: { id: 'audit-next-event', title: 'Picco termico persistente', description: 'Scenario di controllo.', effects: [] },
        genes: AUDIT_GENES,
        selectedGeneId: selectedGene.id,
        selectedAction: null,
        selectedGene,
        status: 'choosing',
        actionsSubmitted: 0,
        canUse: true,
        canEvolve: true,
        canSelectGenes: true,
    }), [selectedGene])

    return (
        <GeneSelectionScreenV2
            viewModel={viewModel}
            onSelectGene={setSelectedGeneId}
            onUseGene={async () => undefined}
            onEvolveGene={async () => undefined}
            onLeaveSession={() => undefined}
        />
    )
}
