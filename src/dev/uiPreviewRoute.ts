export type UiPreviewRoute = 'home' | 'battle' | 'profile' | 'ranking' | 'evolution' | 'draft' | 'lab'

/** Narrows the `?ui-preview=` query parameter to a known development preview route. */
export function isUiPreviewRoute(value: string | null): value is UiPreviewRoute {
    return value === 'home'
        || value === 'battle'
        || value === 'profile'
        || value === 'ranking'
        || value === 'evolution'
        || value === 'draft'
        || value === 'lab'
}
