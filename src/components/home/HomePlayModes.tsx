import { useEffect, useRef } from 'react'

import type { HomeActions, HomeViewModel } from './types'

type HomePlayModesProps = {
    mode: HomeViewModel['mode']
    playModes: HomeViewModel['playModes']
    actions: HomeActions
    isOpen: boolean
    onClose: () => void
}

export function HomePlayModes({ mode, playModes, actions, isOpen, onClose }: HomePlayModesProps) {
    const dialogRef = useRef<HTMLElement>(null)

    useEffect(() => {
        if (!isOpen) {
            return
        }

        const previousOverflow = document.body.style.overflow
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        document.body.style.overflow = 'hidden'
        document.addEventListener('keydown', handleKeyDown)
        dialogRef.current?.focus()

        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, onClose])

    if (!isOpen) {
        return null
    }

    return (
        <div className="home-play-modes-dialog">
            <button type="button" className="home-play-modes-dialog__backdrop" onClick={onClose} aria-label="Chiudi modalita di partita" />
            <section
                id="home-play-modes"
                ref={dialogRef}
                className="home-play-modes"
                role="dialog"
                aria-modal="true"
                aria-labelledby="home-play-modes-title"
                tabIndex={-1}
            >
                <header>
                    <div>
                        <span className="eyebrow">{`Modalit\u00e0 di partita`}</span>
                        <h2 id="home-play-modes-title">Inizia una sfida</h2>
                    </div>
                    <button type="button" className="home-play-modes__close" onClick={onClose} aria-label="Chiudi modalita di partita">Chiudi</button>
                </header>

                {mode === 'guest' ? (
                    <label className="field home-play-modes__field" htmlFor="player-name">
                        <span>Il tuo nome</span>
                        <input
                            id="player-name"
                            value={playModes.nickname}
                            onChange={(event) => actions.onNicknameChange(event.target.value)}
                            placeholder="Es. Lince"
                            maxLength={20}
                            autoComplete="nickname"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                    </label>
                ) : null}

                <button type="button" className="home-play-modes__create" onClick={actions.onCreateGame} disabled={playModes.isBusy}>
                    <span>{playModes.busyAction === 'CREATE' ? 'CREAZIONE...' : 'CREA PARTITA'}</span>
                    <small>Genera un codice da condividere</small>
                </button>

                <div className="home-play-modes__bot">
                    <label className="field home-play-modes__field" htmlFor="bot-difficulty">
                        <span>{`Difficolt\u00e0 bot`}</span>
                        <select
                            id="bot-difficulty"
                            value={playModes.botDifficulty}
                            onChange={(event) => actions.onBotDifficultyChange(event.target.value as 'EASY' | 'NORMAL' | 'HARD')}
                        >
                            <option value="EASY">{'Facile \u2014 casuale'}</option>
                            <option value="NORMAL">{'Normale \u2014 euristico'}</option>
                            <option value="HARD">{'Difficile \u2014 lookahead'}</option>
                        </select>
                    </label>
                    <button type="button" className="home-play-modes__bot-action" onClick={actions.onCreateBotGame} disabled={playModes.isBusy}>
                        <span>{playModes.busyAction === 'CREATE_BOT' ? 'CREAZIONE...' : 'Gioca contro il bot'}</span>
                        <small>Avvio immediato con avversario automatico</small>
                    </button>
                </div>

                <div className="home-play-modes__divider" role="presentation"><span>oppure</span></div>

                <div className="home-play-modes__join-block">
                    <label className="field home-play-modes__field" htmlFor="room-code">
                        <span>{`Hai gi\u00e0 un codice?`}</span>
                        <input
                            id="room-code"
                            value={playModes.roomCode}
                            onChange={(event) => actions.onRoomCodeChange(event.target.value)}
                            placeholder="ABCDE"
                            maxLength={5}
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            className="home-play-modes__code-input"
                        />
                    </label>
                    <button type="button" className="home-play-modes__join" onClick={actions.onJoinGame} disabled={playModes.isBusy}>
                        {playModes.busyAction === 'JOIN' ? 'ENTRO...' : 'ENTRA'}
                    </button>
                </div>
                <p className="home-play-modes__meta">Partita online per 2 giocatori, stesso codice stanza.</p>
                <button type="button" className="home-play-modes__leave" onClick={actions.onLeaveSession}>Pulisci sessione locale</button>
            </section>
        </div>
    )
}
