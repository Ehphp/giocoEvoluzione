import { CreatureVisual } from '../CreatureVisual'
import { createInitialTraits } from '../../game/config'

type HomeScreenProps = {
    nickname: string
    roomCode: string
    isOnline: boolean
    errorMessage: string | null
    statusMessage: string | null
    isBusy: boolean
    busyAction: 'CREATE' | 'JOIN' | null
    onNicknameChange: (value: string) => void
    onRoomCodeChange: (value: string) => void
    onCreateGame: () => void
    onJoinGame: () => void
    onLeaveSession: () => void
}

const HOME_HERO_TRAITS = createInitialTraits()

export function HomeScreen({
    nickname,
    roomCode,
    isOnline,
    errorMessage,
    statusMessage,
    isBusy,
    busyAction,
    onNicknameChange,
    onRoomCodeChange,
    onCreateGame,
    onJoinGame,
    onLeaveSession,
}: HomeScreenProps) {
    return (
        <section className="home-screen" aria-busy={isBusy}>
            <header className="home-screen__header">
                <span className="eyebrow">Multiplayer 1v1</span>
                <h1>Gioco Evoluzione</h1>
                <p className="home-screen__tagline">Evolvi. Adattati. Supera il tuo avversario.</p>
                <p className="home-screen__subcopy">Scegli come evolvere la tua creatura e affronta un altro giocatore round dopo round.</p>
            </header>

            <section className="home-hero" aria-label="Creatura di base">
                <span className="home-hero__orb home-hero__orb--use" aria-hidden="true" />
                <span className="home-hero__orb home-hero__orb--evolve" aria-hidden="true" />
                <span className="home-hero__dot home-hero__dot--1" aria-hidden="true" />
                <span className="home-hero__dot home-hero__dot--2" aria-hidden="true" />
                <CreatureVisual traits={HOME_HERO_TRAITS} className="home-hero__creature" showCaption={false} playerName="Creatura iniziale" />
            </section>

            {!isOnline ? (
                <div className="message warning" role="alert" aria-live="assertive">
                    Connessione offline. La sincronizzazione riprende appena torna la rete.
                </div>
            ) : null}
            {errorMessage ? (
                <div className="message error" role="alert" aria-live="assertive">
                    {errorMessage}
                </div>
            ) : null}
            {statusMessage ? (
                <div className="message success" aria-live="polite">
                    {statusMessage}
                </div>
            ) : null}

            <section className="home-entry" aria-label="Avvio partita multiplayer">
                <label className="field home-entry__field" htmlFor="player-name">
                    <span>Il tuo nome</span>
                    <input
                        id="player-name"
                        value={nickname}
                        onChange={(event) => onNicknameChange(event.target.value)}
                        placeholder="Es. Lince"
                        maxLength={20}
                        autoComplete="nickname"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                </label>

                <button type="button" className="primary-button home-entry__create" onClick={onCreateGame} disabled={isBusy}>
                    <span>{busyAction === 'CREATE' ? 'CREAZIONE...' : 'CREA PARTITA'}</span>
                    <small>Genera un codice da condividere</small>
                </button>

                <div className="home-entry__divider" role="presentation">
                    <span>oppure</span>
                </div>

                <div className="home-entry__join-block">
                    <label className="field home-entry__field" htmlFor="room-code">
                        <span>Hai gia un codice?</span>
                        <input
                            id="room-code"
                            value={roomCode}
                            onChange={(event) => onRoomCodeChange(event.target.value)}
                            placeholder="ABCDE"
                            maxLength={5}
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            className="home-entry__code-input"
                        />
                    </label>

                    <button type="button" className="secondary-button home-entry__join" onClick={onJoinGame} disabled={isBusy}>
                        {busyAction === 'JOIN' ? 'ENTRO...' : 'ENTRA'}
                    </button>
                </div>

                <p className="home-entry__meta">Partita online per 2 giocatori, stesso codice stanza.</p>
            </section>

            <button type="button" className="ghost-button home-screen__leave" onClick={onLeaveSession}>
                Pulisci sessione locale
            </button>
        </section>
    )
}
