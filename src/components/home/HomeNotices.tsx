import type { HomeNotice } from './types'

type HomeNoticesProps = {
    notices: HomeNotice[]
}

export function HomeNotices({ notices }: HomeNoticesProps) {
    if (!notices.length) {
        return null
    }

    return (
        <div className="home-notices" aria-label="Stato applicazione">
            {notices.map((notice) => (
                <div
                    key={notice.id}
                    className={`message ${notice.tone}`}
                    role={notice.tone === 'success' ? 'status' : 'alert'}
                    aria-live={notice.tone === 'success' ? 'polite' : 'assertive'}
                >
                    {notice.message}
                </div>
            ))}
        </div>
    )
}
