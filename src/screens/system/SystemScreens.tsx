import type { ReactNode } from 'react'

import { GAME_SELECTION_ASSETS } from '../battle/controller/gene-selection-assets'
import { ASSETS, srcSetFor } from '../../ui/assets'
import { AppShell, Button, IconButton, Notice, Panel, Pill } from '../../ui/components'
import { CloseIcon, SparkIcon } from '../../ui/icons'

import './SystemScreens.css'

const SCENERY = ASSETS.scenery.forest

function CenteredCard({ children, ...rest }: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className="system-screen">
            <img
                className="system-screen__logo"
                src={ASSETS.branding.logo}
                srcSet={srcSetFor(ASSETS.branding.logo)}
                sizes="min(66vw, 230px)"
                alt="Evori"
            />
            <Panel className="system-card" {...rest}>{children}</Panel>
        </div>
    )
}

/** Shown while the session and profile are being restored. */
export function BootScreen() {
    return (
        <AppShell sceneryUrl={SCENERY} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}>
            <CenteredCard role="status" aria-live="polite" aria-busy="true">
                <span className="ev-eyebrow">Connessione alla partita</span>
                <h1>Preparazione in corso</h1>
                <p className="system-card__copy">Sto ripristinando profilo, creatura e sessione multiplayer.</p>
                <span className="system-card__spinner" aria-hidden="true" />
            </CenteredCard>
        </AppShell>
    )
}

/** Shown when the Supabase environment variables are missing. */
export function MissingConfigScreen() {
    return (
        <AppShell sceneryUrl={SCENERY} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback} scroll>
            <CenteredCard>
                <span className="ev-eyebrow">Multiplayer 1v1</span>
                <h1>Configurazione mancante</h1>
                <p className="system-card__copy">
                    L app e pronta, ma il multiplayer richiede Supabase prima di poter creare o entrare in una stanza.
                </p>
                <Notice tone="warning">
                    Imposta <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong>, applica lo schema SQL
                    e distribuisci la funzione <strong>resolve-round</strong>.
                </Notice>
            </CenteredCard>
        </AppShell>
    )
}

type WaitingRoomScreenProps = {
    roomCode: string
    nickname: string
    isOnline: boolean
    errorMessage: string | null
    statusMessage: string | null
    onCopyRoomCode: () => void
    onLeaveSession: () => void
}

/** Host lobby shown until the second player joins the room. */
export function WaitingRoomScreen({
    roomCode,
    nickname,
    isOnline,
    errorMessage,
    statusMessage,
    onCopyRoomCode,
    onLeaveSession,
}: WaitingRoomScreenProps) {
    return (
        <AppShell sceneryUrl={SCENERY} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback} scroll>
            <section className="waiting-room" aria-labelledby="waiting-room-title">
                <header className="waiting-room__topbar">
                    <Pill icon={<SparkIcon />}>Stanza aperta</Pill>
                    <IconButton label="Esci dalla partita" variant="danger" onClick={onLeaveSession}>
                        <CloseIcon />
                    </IconButton>
                </header>

                {!isOnline ? <Notice tone="warning">Connessione offline. La sincronizzazione riprende appena torna la rete.</Notice> : null}
                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
                {statusMessage ? <Notice tone="success">{statusMessage}</Notice> : null}

                <Panel className="waiting-room__card">
                    <span className="ev-eyebrow">Codice stanza</span>
                    <p className="waiting-room__code">{roomCode}</p>
                    <p className="system-card__copy">Condividilo con il secondo giocatore: la partita parte appena entra nella stanza.</p>
                    <Button tone="use" block onClick={onCopyRoomCode}>Copia codice</Button>
                </Panel>

                <Panel className="waiting-room__status" aria-live="polite">
                    <span className="system-card__spinner" aria-hidden="true" />
                    <div>
                        <h2 id="waiting-room-title">{nickname} e pronto</h2>
                        <p className="system-card__copy">In attesa dell avversario...</p>
                    </div>
                </Panel>
            </section>
        </AppShell>
    )
}

/** Fallback for a finished match whose recap could not be built. */
export function MissingResultScreen({ onLeaveSession }: { onLeaveSession: () => void }) {
    return (
        <AppShell sceneryUrl={SCENERY} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}>
            <CenteredCard role="alert">
                <span className="ev-eyebrow">Partita conclusa</span>
                <h1>Risultato non disponibile</h1>
                <p className="system-card__copy">Non e stato possibile ricostruire il riepilogo di questa partita.</p>
                <Button tone="cream" block onClick={onLeaveSession}>Torna alla home</Button>
            </CenteredCard>
        </AppShell>
    )
}
