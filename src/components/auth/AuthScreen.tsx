import { useEffect, useState, type FormEvent } from 'react'

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

    useEffect(() => {
        setMessage(initialError)
    }, [initialError])

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsBusy(true)
        setMessage(null)

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
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <section className="auth-screen" aria-labelledby="auth-title">
            <div className="auth-screen__brand">
                <span className="eyebrow">Gioco Evoluzione</span>
                <h1 id="auth-title">{mode === 'sign-in' ? 'Bentornato' : 'Crea il tuo profilo'}</h1>
                <p>{mode === 'sign-in' ? 'Accedi per ritrovare creatura, partite e progressi.' : 'La tua creatura iniziale verrà creata insieme al profilo.'}</p>
            </div>

            <form className="auth-screen__form" onSubmit={(event) => void handleSubmit(event)}>
                <label className="field" htmlFor="auth-username">
                    <span>Nome utente</span>
                    <input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={20} autoComplete="username" required />
                </label>
                <label className="field" htmlFor="auth-password">
                    <span>Password</span>
                    <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} required />
                </label>

                {message ? <p className="auth-screen__message" role="status">{message}</p> : null}

                <button className="auth-screen__submit" type="submit" disabled={isBusy}>
                    {isBusy ? 'Attendi…' : mode === 'sign-in' ? 'Accedi' : 'Registrati'}
                </button>
            </form>

            <button type="button" className="auth-screen__toggle" onClick={() => { setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(null) }} disabled={isBusy}>
                {mode === 'sign-in' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
            </button>
        </section>
    )
}
