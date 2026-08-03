import { useEffect, useState, type FormEvent } from 'react'

import './AuthScreen.css'

type AuthScreenProps = {
    initialError?: string | null
    onSignIn: (input: { username: string; password: string }) => Promise<void>
}

export function AuthScreen({ initialError = null, onSignIn }: AuthScreenProps) {
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
            await onSignIn({ username, password })
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
                <h1 id="auth-title">Bentornato</h1>
                <p>Accedi per ritrovare creatura, partite e progressi.</p>
            </div>

            <form className="auth-screen__form" onSubmit={(event) => void handleSubmit(event)}>
                <label className="field" htmlFor="auth-username">
                    <span>Nome utente</span>
                    <input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={20} autoComplete="username" required />
                </label>
                <label className="field" htmlFor="auth-password">
                    <span>Password</span>
                    <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} required />
                </label>

                {message ? <p className="auth-screen__message" role="status">{message}</p> : null}

                <button className="auth-screen__submit" type="submit" disabled={isBusy}>
                    {isBusy ? 'Attendi…' : 'Accedi'}
                </button>
            </form>
        </section>
    )
}
