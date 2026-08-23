import { useEffect, useState, type FormEvent } from 'react'

import { GAME_SELECTION_ASSETS } from '../battle/controller/gene-selection-assets'
import { ASSETS } from '../../ui/assets'
import { AppShell, Button, Notice, Panel } from '../../ui/components'

import './AuthScreen.css'

type AuthScreenProps = {
    initialError?: string | null
    onSignIn: (input: { username: string; password: string }) => Promise<void>
    onSignUp: (input: { username: string; password: string }) => Promise<{ requiresEmailConfirmation: boolean }>
}

export function AuthScreen({ initialError = null, onSignIn, onSignUp }: AuthScreenProps) {
    const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(initialError)
    const [isError, setIsError] = useState(Boolean(initialError))

    useEffect(() => {
        setMessage(initialError)
        setIsError(Boolean(initialError))
    }, [initialError])

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsBusy(true)
        setMessage(null)
        setIsError(false)

        try {
            if (mode === 'sign-up') {
                const result = await onSignUp({ username, password })
                setMessage(result.requiresEmailConfirmation
                    ? 'Account creato. Controlla la tua email per confermare l\'accesso.'
                    : 'Account creato. Prepariamo il tuo profilo.')
            } else {
                await onSignIn({ username, password })
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Autenticazione non riuscita.')
            setIsError(true)
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <AppShell
            sceneryUrl={ASSETS.scenery.forest}
            sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}
            scroll
        >
            <section className="auth-screen" aria-labelledby="auth-title">
                <img className="auth-screen__logo" src={ASSETS.branding.logo} alt="Evori" />

                <Panel className="auth-card">
                    <div className="auth-card__intro">
                        <span className="ev-eyebrow">{mode === 'sign-in' ? 'Bentornato' : 'Nuovo allenatore'}</span>
                        <h1 id="auth-title">{mode === 'sign-in' ? 'Accedi' : 'Crea il tuo profilo'}</h1>
                        <p>{mode === 'sign-in'
                            ? 'Ritrova creatura, partite e progressi.'
                            : 'La tua creatura iniziale nasce insieme al profilo.'}</p>
                    </div>

                    <form className="auth-card__form" onSubmit={(event) => void handleSubmit(event)}>
                        <label className="ev-field" htmlFor="auth-username">
                            <span>Nome utente</span>
                            <input
                                id="auth-username"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                minLength={3}
                                maxLength={20}
                                autoComplete="username"
                                required
                            />
                        </label>
                        <label className="ev-field" htmlFor="auth-password">
                            <span>Password</span>
                            <input
                                id="auth-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                                minLength={6}
                                required
                            />
                        </label>

                        {message ? <Notice tone={isError ? 'error' : 'success'}>{message}</Notice> : null}

                        <Button tone="use" block type="submit" disabled={isBusy}>
                            {isBusy ? 'Attendi...' : mode === 'sign-in' ? 'Accedi' : 'Registrati'}
                        </Button>
                    </form>

                    <button
                        type="button"
                        className="auth-card__toggle"
                        disabled={isBusy}
                        onClick={() => {
                            setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')
                            setMessage(null)
                            setIsError(false)
                        }}
                    >
                        {mode === 'sign-in' ? 'Non hai un account? Registrati' : 'Hai gia un account? Accedi'}
                    </button>
                </Panel>
            </section>
        </AppShell>
    )
}
