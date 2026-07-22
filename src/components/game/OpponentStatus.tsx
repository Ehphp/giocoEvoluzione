type OpponentStatusProps = {
    name: string
    status: string
    avatarSrc: string
    avatarAlt: string
}

export function OpponentStatus({ name, status, avatarSrc, avatarAlt }: OpponentStatusProps) {
    return (
        <div className="opponent-status">
            <div className="opponent-status__avatar">
                <img src={avatarSrc} alt={avatarAlt} className="opponent-status__image" />
            </div>
            <div className="opponent-status__copy">
                <span className="opponent-status__label">Avversario</span>
                <strong>{name}</strong>
                <span>{status}</span>
            </div>
        </div>
    )
}