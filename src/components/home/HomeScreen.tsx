type HomeScreenProps = {
    nickname: string
    roomCode: string
    botDifficulty: 'EASY' | 'NORMAL' | 'HARD'
    isOnline: boolean
    errorMessage: string | null
    statusMessage: string | null
    isBusy: boolean
    busyAction: 'CREATE' | 'CREATE_BOT' | 'JOIN' | null
    onNicknameChange: (value: string) => void
    onRoomCodeChange: (value: string) => void
    onBotDifficultyChange: (value: 'EASY' | 'NORMAL' | 'HARD') => void
    onCreateGame: () => void
    onCreateBotGame: () => void
    onJoinGame: () => void
    onLeaveSession: () => void
}

export function HomeScreen({
    nickname,
    roomCode,
    botDifficulty,
    isOnline,
    errorMessage,
    statusMessage,
    isBusy,
    busyAction,
    onNicknameChange,
    onRoomCodeChange,
    onBotDifficultyChange,
    onCreateGame,
    onCreateBotGame,
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

            <section className="home-entry" aria-label="Avvio partita">
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

                <label className="field home-entry__field" htmlFor="bot-difficulty">
                    <span>Difficoltà bot</span>
                    <select id="bot-difficulty" value={botDifficulty} onChange={(event) => onBotDifficultyChange(event.target.value as 'EASY' | 'NORMAL' | 'HARD')}>
                        <option value="EASY">Facile — casuale</option><option value="NORMAL">Normale — euristico</option><option value="HARD">Difficile — lookahead</option>
                    </select>
                </label>
                <button type="button" className="secondary-button home-entry__create" onClick={onCreateBotGame} disabled={isBusy}>
                    <span>{busyAction === 'CREATE_BOT' ? 'CREAZIONE...' : 'Gioca contro il bot'}</span>
                    <small>Avvio immediato con avversario automatico</small>
                </button>

                <div className="home-entry__divider" role="presentation">
                    <span>oppure</span>
                </div>

                <div className="home-entry__join-block">
                    <label className="field home-entry__field" htmlFor="room-code">
                        <span>Hai già un codice?</span>
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
