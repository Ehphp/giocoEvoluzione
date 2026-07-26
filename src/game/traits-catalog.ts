import { GENE_CATALOG } from '../../shared/game-rules/catalog.ts'
import type { GeneDefinition, GeneId } from '../../shared/game-rules/types.ts'

export type TraitCatalogEntry = GeneDefinition & { iconKey: GeneId }
export const TRAIT_CATALOG = Object.fromEntries(Object.entries(GENE_CATALOG).map(([id, definition]) => [id, { ...definition, iconKey: definition.id }])) as Record<GeneId, TraitCatalogEntry>
