export type UiPreviewRoute = 'home' | 'battle' | 'profile' | 'evolution' | 'draft'

/** Narrows the `?ui-preview=` query parameter to a known development preview route. */
export function isUiPreviewRoute(value: string | null): value is UiPreviewRoute {
    return value === 'home' || value === 'battle' || value === 'profile' || value === 'evolution' || value === 'draft'
}
