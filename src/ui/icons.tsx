import type { SVGProps } from 'react'
import {
    ArrowDown,
    ArrowUp,
    Backpack,
    ChevronRight,
    Clock,
    Dna,
    Info,
    Lock,
    LogOut,
    ShieldCheck,
    Sparkles,
    Store,
    Swords,
    Trophy,
    User,
    X,
    Zap,
} from 'lucide-react'

import type { TraitType } from '../game/types'

/**
 * The one place icons come from.
 *
 * Interface icons are Lucide, re-exported under product names so call sites never import the
 * library directly and the set stays swappable. Gene glyphs stay hand-drawn: they are brand
 * artwork and paint themselves from the `--gene-color*` tokens exposed by a `[data-gene]`
 * ancestor, so one component covers every adaptation.
 *
 * Never use an emoji or a text character as an icon.
 */

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false" {...props}>
            {children}
        </svg>
    )
}

const LIGHT = 'var(--gene-color, currentColor)'
const DARK = 'var(--gene-color-strong, currentColor)'

/** Ferocia — clawed strike. */
function FerocityIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M4.4 3.6c3.4.5 6.4 2.2 8.9 5 2.5 2.9 4 6.3 4.5 10.1-2.6-1-4.6-2.5-6.1-4.4-.4 1.3-.3 2.6.4 3.9-2.3-1-3.8-2.6-4.6-4.8-.7 1.1-.9 2.4-.6 3.8-2-1.9-3-4.2-3-6.9 0-2.4.5-4.6 1.4-6.7Z" fill={LIGHT} />
            <path d="M13.3 8.6c2.5 2.9 4 6.3 4.5 10.1-2.6-1-4.6-2.5-6.1-4.4.9-1.8 1.4-3.7 1.6-5.7Z" fill={DARK} opacity=".55" />
            <path d="M18.6 19.4c.8.6 1.7 1 2.8 1.3" stroke={DARK} strokeWidth="2" strokeLinecap="round" />
        </Svg>
    )
}

/** Corazza — riveted shield. */
function ArmorIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 2.6 20 5v6.6c0 4.4-2.8 8.2-8 9.8-5.2-1.6-8-5.4-8-9.8V5l8-2.4Z" fill={LIGHT} />
            <path d="M12 2.6 20 5v6.6c0 4.4-2.8 8.2-8 9.8V2.6Z" fill={DARK} opacity=".45" />
            <path d="M12 6.4 16.4 8v3.9c0 2.4-1.6 4.5-4.4 5.5-2.8-1-4.4-3.1-4.4-5.5V8L12 6.4Z" fill="#fff" opacity=".32" />
        </Svg>
    )
}

/** Agilita — leaf sweep. */
function AgilityIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M20.4 3.2c.9 6.2-.6 10.7-4.4 13.6-3.1 2.3-6.6 2.4-10.5.2 1-4.5 3.3-7.7 6.9-9.7 2.3-1.3 4.9-2.6 8-4.1Z" fill={LIGHT} />
            <path d="M20.4 3.2c-4.4 2.7-7.6 5.2-9.7 7.6-2 2.4-3.6 5.8-4.7 10.2" stroke={DARK} strokeWidth="1.9" strokeLinecap="round" />
            <path d="M15.6 7.1c-2.2 1.3-3.9 2.7-5.2 4.2" stroke={DARK} strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
        </Svg>
    )
}

/** Sensi — watchful eye. */
function SensesIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 4.3c4.5 0 8.2 2.6 10.3 7.7-2.1 5.1-5.8 7.7-10.3 7.7S3.8 17.1 1.7 12C3.8 6.9 7.5 4.3 12 4.3Z" fill={LIGHT} />
            <circle cx="12" cy="12" r="4.6" fill={DARK} />
            <circle cx="12" cy="12" r="2" fill="#0e1a12" />
            <circle cx="10.4" cy="10.3" r="1.1" fill="#fff" opacity=".85" />
        </Svg>
    )
}

/** Mimetismo — layered camouflage patches. */
function CamouflageIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 2.4c4.4 2 7.2 4.7 8.5 8.2 1.3 3.5.3 6.5-3 9-2.9-.6-4.7-2.1-5.5-4.5-1.4 2.1-3.4 3.6-6 4.5-2.7-3.2-3.4-6.5-2-9.8 1.4-3.3 4.1-5.8 8-7.4Z" fill={LIGHT} />
            <path d="M12 2.4c4.4 2 7.2 4.7 8.5 8.2 1.3 3.5.3 6.5-3 9-2.9-.6-4.7-2.1-5.5-4.5V2.4Z" fill={DARK} opacity=".5" />
            <path d="M7.6 8.7c1.5-.5 2.8-.2 3.9.9M15 14.6c1.3.3 2.4 0 3.3-.9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
        </Svg>
    )
}

const GENE_ICONS: Record<TraitType, (props: IconProps) => React.JSX.Element> = {
    FEROCITY: FerocityIcon,
    ARMOR: ArmorIcon,
    AGILITY: AgilityIcon,
    SENSES: SensesIcon,
    CAMOUFLAGE: CamouflageIcon,
}

export function GeneIcon({ trait, ...props }: IconProps & { trait: TraitType }) {
    const Component = GENE_ICONS[trait]

    return <Component {...props} />
}

/* -------------------------------------------------------------------------- */
/* Interface — Lucide, re-exported under product names                         */
/* -------------------------------------------------------------------------- */

export const ShopIcon = Store
export const CollectionIcon = Backpack
export const BattleIcon = Swords
export const RankingIcon = Trophy
export const ProfileIcon = User
export const TrophyIcon = Trophy
export const DnaIcon = Dna
export const BoltIcon = Zap
export const ClockIcon = Clock
export const InfoIcon = Info
export const ChevronIcon = ChevronRight
export const CloseIcon = X
export const ExitIcon = LogOut
export const LockIcon = Lock
export const SparkIcon = Sparkles
export const ShieldCheckIcon = ShieldCheck
export const ArrowUpIcon = ArrowUp
export const ArrowDownIcon = ArrowDown
