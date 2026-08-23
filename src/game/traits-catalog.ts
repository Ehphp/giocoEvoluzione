import { ADAPTATION_CATALOG } from '../../shared/game-rules/catalog.ts'
import type { AdaptationDefinition, AdaptationId } from '../../shared/game-rules/types.ts'
export type TraitCatalogEntry = AdaptationDefinition & { iconKey: AdaptationId }
export const TRAIT_CATALOG = Object.fromEntries(
    Object.entries(ADAPTATION_CATALOG).map(([id, definition]) => [id, { ...definition, iconKey: definition.id }]),
) as Record<AdaptationId, TraitCatalogEntry>
