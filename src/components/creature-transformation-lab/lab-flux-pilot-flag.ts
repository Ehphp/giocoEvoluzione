/** Keeps the production-pipeline shortcut out of normal Lab sessions. */
export function isFluxPilotShortcutVisible(value: string | boolean | undefined): boolean {
    return value === 'true' || value === true
}
