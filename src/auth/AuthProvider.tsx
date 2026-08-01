import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import {
    bootstrapMyProfile,
    loadMyProfile,
    type PlayerCreatureRecord,
    type ProfileRecord,
    updateMyNickname,
} from '../lib/profile-api'
import { hasSupabaseConfig, requireSupabase } from '../lib/supabase'

export type AuthenticationStatus = 'loading' | 'unauthenticated' | 'initializing' | 'ready' | 'error'

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}$/

function requireUsername(value: string) {
    const username = value.trim()

    if (!USERNAME_PATTERN.test(username)) {
        throw new Error('Scegli un nome utente da 3 a 20 caratteri: lettere, numeri, trattino o underscore.')
    }

    return username
}

function getAuthEmail(identifier: string) {
    const trimmedIdentifier = identifier.trim()

    // Existing accounts created before the username-only flow can still sign in.
    if (trimmedIdentifier.includes('@')) {
        return trimmedIdentifier.toLowerCase()
    }

    return `${requireUsername(trimmedIdentifier).toLowerCase()}@accounts.evoluzione.invalid`
}

type AuthContextValue = {
    status: AuthenticationStatus
    session: Session | null
    user: User | null
    profile: ProfileRecord | null
    creature: PlayerCreatureRecord | null
    error: string | null
    signUp: (input: { username: string; password: string }) => Promise<{ requiresEmailConfirmation: boolean }>
    signIn: (input: { username: string; password: string }) => Promise<void>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
    updateNickname: (nickname: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthenticationStatus>(hasSupabaseConfig ? 'loading' : 'unauthenticated')
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<ProfileRecord | null>(null)
    const [creature, setCreature] = useState<PlayerCreatureRecord | null>(null)
    const [error, setError] = useState<string | null>(null)
    const requestVersion = useRef(0)

    const resolveSession = useCallback(async (nextSession: Session | null) => {
        const version = requestVersion.current + 1
        requestVersion.current = version
        setSession(nextSession)

        if (!nextSession) {
            setProfile(null)
            setCreature(null)
            setError(null)
            setStatus('unauthenticated')
            return
        }

        setStatus('initializing')
        setError(null)

        try {
            await bootstrapMyProfile()
            const account = await loadMyProfile()

            if (requestVersion.current !== version) {
                return
            }

            setProfile(account.profile)
            setCreature(account.creature)
            setStatus('ready')
        } catch (nextError) {
            if (requestVersion.current !== version) {
                return
            }

            setProfile(null)
            setCreature(null)
            setError(nextError instanceof Error ? nextError.message : 'Impossibile inizializzare il profilo.')
            setStatus('error')
        }
    }, [])

    useEffect(() => {
        if (!hasSupabaseConfig) {
            return
        }

        let active = true
        const supabase = requireSupabase()

        void supabase.auth.getSession().then(({ data, error: sessionError }) => {
            if (!active) {
                return
            }

            if (sessionError) {
                setError(sessionError.message)
                setStatus('error')
                return
            }

            void resolveSession(data.session)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            void resolveSession(nextSession)
        })

        return () => {
            active = false
            listener.subscription.unsubscribe()
        }
    }, [resolveSession])

    const refreshProfile = useCallback(async () => {
        if (!session) {
            return
        }

        await resolveSession(session)
    }, [resolveSession, session])

    const signUp = useCallback(async ({ username, password }: { username: string; password: string }) => {
        const accountUsername = requireUsername(username)

        const { data, error: signUpError } = await requireSupabase().auth.signUp({
            email: getAuthEmail(accountUsername),
            password,
            options: {
                data: { nickname: accountUsername },
            },
        })

        if (signUpError) {
            throw new Error(signUpError.message)
        }

        return { requiresEmailConfirmation: !data.session }
    }, [])

    const signIn = useCallback(async ({ username, password }: { username: string; password: string }) => {
        const { error: signInError } = await requireSupabase().auth.signInWithPassword({
            email: getAuthEmail(username),
            password,
        })

        if (signInError) {
            throw new Error(signInError.message)
        }
    }, [])

    const signOut = useCallback(async () => {
        const { error: signOutError } = await requireSupabase().auth.signOut()

        if (signOutError) {
            throw new Error(signOutError.message)
        }
    }, [])

    const updateNickname = useCallback(async (nickname: string) => {
        const updatedProfile = await updateMyNickname(nickname)
        setProfile(updatedProfile)
    }, [])

    const value = useMemo<AuthContextValue>(() => ({
        status,
        session,
        user: session?.user ?? null,
        profile,
        creature,
        error,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        updateNickname,
    }), [creature, error, profile, refreshProfile, session, signIn, signOut, signUp, status, updateNickname])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
    const context = useContext(AuthContext)

    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider.')
    }

    return context
}
