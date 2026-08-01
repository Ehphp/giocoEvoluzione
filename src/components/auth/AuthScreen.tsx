import { useEffect, useState, type FormEvent } from 'react'

import './AuthScreen.css'

type AuthScreenProps = {
    initialError?: string | null
    onSignIn: (input: { email: string; password: string }) => Promise<void>
    onSignUp: (input: { email: string; password: string; nickname: string }) => Promise<{ requiresEmailConfirmation: boolean }>
}

export function AuthScreen({ initialError = null, onSignIn, onSignUp }: AuthScreenProps) {
    const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [nickname, setNickname] = useState('')
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
                const result = await onSignUp({ email, password, nickname })
                setMessage(result.requiresEmailConfirmation
                    ? 'Account creato. Controlla la tua email per confermare l’accesso.'
                    : 'Account creato. Prepariamo il tuo profilo.')
            } else {
                await onSignIn({ email, password })
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
                {mode === 'sign-up' ? (
                    <label className="field" htmlFor="auth-nickname">
                        <span>Nickname</span>
                        <input id="auth-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} autoComplete="nickname" required />
                    </label>
                ) : null}
                <label className="field" htmlFor="auth-email">
                    <span>Email</span>
                    <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
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
