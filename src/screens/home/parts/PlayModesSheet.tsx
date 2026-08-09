import { type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Button, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { ChevronIcon, SparkIcon } from '../../../ui/icons'
import type { HomeActions, HomeViewModel } from '../types'

type PlayModesSheetProps = {
    mode: HomeViewModel['mode']
    playModes: HomeViewModel['playModes']
    actions: HomeActions
    onClose: () => void
}

const ROOM_CODE_LENGTH = 5

function normalizeRoomCodeInput(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase().slice(0, ROOM_CODE_LENGTH)
}

export function PlayModesSheet({ mode, playModes, actions, onClose }: PlayModesSheetProps) {
    function handleRoomCodeKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter' || playModes.isBusy) {
            return
        }

        event.preventDefault()
        actions.onJoinGame()
    }

    return (
        <Overlay label="Modalita di partita" onClose={onClose}>
            <Panel className="play-modes">
                <SheetHeader eyebrow="Modalita di partita" title="Inizia una sfida" onClose={onClose} />

                {mode === 'guest' ? (
                    <label className="ev-field" htmlFor="player-name">
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

                <button type="button" className="play-modes__option play-modes__option--pvp" onClick={actions.onCreateGame} disabled={playModes.isBusy}>
                    <SparkIcon aria-hidden="true" />
                    <span>
                        <strong>{playModes.busyAction === 'CREATE' ? 'CREAZIONE...' : 'CREA PARTITA'}</strong>
                        <small>Genera un codice da condividere</small>
                    </span>
                    <ChevronIcon aria-hidden="true" />
                </button>

                <div className="play-modes__bot">
                    <label className="ev-field" htmlFor="bot-difficulty">
                        <span>{'Difficoltà bot'}</span>
                        <select
                            id="bot-difficulty"
                            value={playModes.botDifficulty}
                            onChange={(event) => actions.onBotDifficultyChange(event.target.value as 'EASY' | 'NORMAL' | 'HARD')}
                        >
                            <option value="EASY">{'Facile — casuale'}</option>
                            <option value="NORMAL">{'Normale — euristico'}</option>
                            <option value="HARD">{'Difficile — lookahead'}</option>
                        </select>
                    </label>
                    <Button tone="info" block onClick={actions.onCreateBotGame} disabled={playModes.isBusy}>
                        {playModes.busyAction === 'CREATE_BOT' ? 'CREAZIONE...' : 'Gioca contro il bot'}
                    </Button>
                </div>

                <p className="play-modes__divider" role="presentation"><span>oppure</span></p>

                <div className="play-modes__join">
                    <label className="ev-field" htmlFor="room-code">
                        <span>{'Hai già un codice?'}</span>
                        <input
                            id="room-code"
                            value={playModes.roomCode}
                            onChange={(event) => actions.onRoomCodeChange(normalizeRoomCodeInput(event.target.value))}
                            placeholder="ABCDE"
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            className="play-modes__code"
                            onKeyDown={handleRoomCodeKeyDown}
                        />
                    </label>
                    <Button tone="use" onClick={actions.onJoinGame} disabled={playModes.isBusy}>
                        {playModes.busyAction === 'JOIN' ? 'ENTRO...' : 'ENTRA'}
                    </Button>
                </div>

                <p className="play-modes__meta">Partita online per 2 giocatori, stesso codice stanza.</p>
                <button type="button" className="play-modes__reset" onClick={actions.onLeaveSession}>Pulisci sessione locale</button>
            </Panel>
        </Overlay>
    )
}
