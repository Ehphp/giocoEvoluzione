import { RULE_VERSION } from '../shared/game-rules/index.ts'
import { validateProductionCatalog } from './audit-catalog.ts'
validateProductionCatalog()
console.log(
    JSON.stringify({
        audit: 'catalog-diagnostic',
        ruleVersion: RULE_VERSION,
        matrixSearch: 'disabled-by-design',
        status: 'passed',
    }),
)
