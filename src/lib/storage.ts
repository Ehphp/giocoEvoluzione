const STORAGE_KEY = 'gioco-evoluzione-session'

export type StoredSession = {
    playerId: string
    gameId: string
    roomCode: string
}

export function createPlayerId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID()
    }

    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const buffer = new Uint8Array(16)
        globalThis.crypto.getRandomValues(buffer)

        return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('')
    }

    return `player-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function loadStoredSession(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
        return null
    }

    try {
        return JSON.parse(raw) as StoredSession
    } catch {
        localStorage.removeItem(STORAGE_KEY)

        return null
    }
}

export function saveStoredSession(session: StoredSession) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEY)
}