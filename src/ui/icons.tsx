import type { SVGProps } from 'react'
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Backpack,
    ChevronRight,
    Dna,
    Eye,
    Info,
    Lock,
    Rocket,
    Plus,
    Flame,
    Leaf,
    LogOut,
    PawPrint,
    Skull,
    ShieldCheck,
    Signpost,
    Sparkles,
    Store,
    Swords,
    Trophy,
    User,
    Volume2,
    VolumeX,
    X,
    Zap,
} from 'lucide-react'

import type { EvolutionTargetId } from '../../shared/creature-transformations/evolution-targets.ts'
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
/* Evolution targets — anatomical regions, one glyph each                      */
/* -------------------------------------------------------------------------- */

/*
 * Anatomical glyphs are single-colour silhouettes: they sit on solid gradient chips where a
 * two-tone treatment would collapse, so depth comes from opacity, never from a second hue.
 */

/** Coda: a tapering tail with dorsal spikes. */
function TailIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M2.4 21.4c5.6.6 10-.6 13.2-3.6 3.2-3 4.8-7.4 4.8-13.2l-3.6 3.2-1-3.4-2.6 4.6-1.6-2.6-2 5.2-2-1.6-.6 4.6-2.6-1.2Z" fill="currentColor" />
            <path d="M6.6 18.6c3-.4 5.4-1.6 7.2-3.6 1.8-2 2.9-4.7 3.2-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".4" fill="none" />
        </Svg>
    )
}

/** Arti e zampe: a clawed foot standing for the whole limb system. */
function LimbsAndFeetIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M4.6 12.6c0-3.4 3.3-5.8 7.4-5.8s7.4 2.4 7.4 5.8c0 4-3 7.2-7.4 7.2s-7.4-3.2-7.4-7.2Z" fill="currentColor" />
            <g fill="currentColor">
                <ellipse cx="6" cy="5.4" rx="2.1" ry="2.7" />
                <ellipse cx="12" cy="3.6" rx="2.2" ry="2.9" />
                <ellipse cx="18" cy="5.4" rx="2.1" ry="2.7" />
            </g>
            <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".38" fill="none">
                <path d="M8.6 14.2c1.2 1.4 5.6 1.4 6.8 0" />
            </g>
        </Svg>
    )
}

/** Testa e corona: cranio con corna e creste. */
function HeadAndCrownIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M11.8 2.6c4.8 0 8.2 2.6 9.2 6.8.7 3-.3 5.6-2.8 7.7l.7 3.5c.2.8-.4 1.6-1.3 1.6H6.6c-2.3 0-3.8-1.4-4.2-3.8-.3-1.7-.5-3.2-.5-4.5 0-6.3 3.3-11.3 9.9-11.3Z" fill="currentColor" />
            <circle cx="9.2" cy="10.8" r="3.3" fill="currentColor" opacity=".35" />
            <circle cx="9.2" cy="10.8" r="1.5" fill="currentColor" opacity=".2" />
            <path d="M5 18.4h5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".4" />
        </Svg>
    )
}

/** Strutture dorsali: dorso con spine e creste. */
function DorsalStructuresIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M3 15.6c0-4.8 3.6-8.2 9-8.2s9 3.4 9 8.2c0 3.6-2.5 5.9-6.3 5.9H9.3C5.5 21.5 3 19.2 3 15.6Z" fill="currentColor" />
            <path d="M5.6 8.8 8 2.6l2.8 4.6L13.6 1.8l2.6 6 2.4-3.6.8 5.6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none" />
            <path d="M7.4 16.8h9.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".4" />
        </Svg>
    )
}

/** Pelle e rivestimento: overlapping scales, read through the gaps between them. */
function SkinAndCoveringIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <g fill="currentColor">
                <path d="M2.6 8.4c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" />
                <path d="M11.2 8.4c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" />
                <path d="M6.9 15c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" />
                <path d="M15.5 15c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" opacity=".55" />
                <path d="M-1.7 15c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" opacity=".55" />
                <path d="M2.6 21.6c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" />
                <path d="M11.2 21.6c0-2.4 1.7-4 3.9-4s3.9 1.6 3.9 4Z" />
            </g>
        </Svg>
    )
}

/** Forma del corpo: volume e proporzioni del tronco. */
function BodyShapeIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M7.4 4.6c3.6-1.5 7.2-.4 9 2.6 1.9 3.1 1.3 6.9-1.4 9.3-2.7 2.4-6.6 2.7-9 .6-2.4-2.1-2.9-5.6-1.4-8.7.7-1.5 1.6-2.7 2.8-3.8Z" fill="currentColor" />
            <path d="M2.4 3.2v3.4M2.4 20.8v-3.4M2.4 4.4h3.2M2.4 19.6h3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
        </Svg>
    )
}

/** Ali: membrana e nervature. */
function WingsIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 4.2c2.6 3 5.6 4.6 9 4.8-1.2 5.2-4.4 8.4-9 9.6-4.6-1.2-7.8-4.4-9-9.6 3.4-.2 6.4-1.8 9-4.8Z" fill="currentColor" />
            <path d="M12 6.6v11.2M8.4 8.8l2 7M15.6 8.8l-2 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35" fill="none" />
        </Svg>
    )
}

/** Tentacoli: appendici avvolgenti con ventose. */
function TentaclesIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 2.4c3.2 0 5.6 2.2 5.6 5.2 0 1.6-.6 2.8-1.6 4Z" fill="currentColor" />
            <path d="M8.6 3.6c-2.4 1.2-3.6 3.2-3.6 6 0 3.4 1.8 6 4.4 8M12 4.2c0 4-.6 7.2-1.8 9.6-.9 1.9-.7 3.6.6 5.2M15.6 4.4c2.4 1.6 3.4 3.8 3 6.6-.4 2.6-1.8 4.8-4.2 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            <g fill="currentColor" opacity=".45">
                <circle cx="6.2" cy="14.4" r="1.1" />
                <circle cx="11" cy="19.8" r="1.1" />
                <circle cx="16.6" cy="15.6" r="1.1" />
            </g>
        </Svg>
    )
}

const EVOLUTION_TARGET_ICONS: Record<EvolutionTargetId, (props: IconProps) => React.JSX.Element> = {
    TAIL: TailIcon,
    LIMBS_AND_FEET: LimbsAndFeetIcon,
    HEAD_AND_CROWN: HeadAndCrownIcon,
    BODY_SHAPE: BodyShapeIcon,
    DORSAL_STRUCTURES: DorsalStructuresIcon,
    SKIN_AND_COVERING: SkinAndCoveringIcon,
    WINGS: WingsIcon,
    TENTACLES: TentaclesIcon,
}

/** Anatomical region glyph. Paints from `--gene-color*` when a `[data-gene]` ancestor sets them. */
export function EvolutionTargetIcon({ target, ...props }: IconProps & { target: EvolutionTargetId }) {
    const Component = EVOLUTION_TARGET_ICONS[target]

    return <Component {...props} />
}

/* -------------------------------------------------------------------------- */
/* Interface — Lucide, re-exported under product names                         */
/* -------------------------------------------------------------------------- */

export const ShopIcon = Store
export const CollectionIcon = Backpack
export const BattleIcon = Swords
export const RankingIcon = Trophy
/* The dock destination is the creature, not the account — a paw reads as one without picking a species. */
export const CreatureIcon = PawPrint
export const ProfileIcon = User
export const TrophyIcon = Trophy
export const DnaIcon = Dna
export const EyeIcon = Eye
export const BoltIcon = Zap
export const InfoIcon = Info
export const ChevronIcon = ChevronRight
export const CloseIcon = X
export const ExitIcon = LogOut
export const LockIcon = Lock
export const SparkIcon = Sparkles
export const CrossroadsIcon = Signpost
export const ShieldCheckIcon = ShieldCheck
export const ArrowUpIcon = ArrowUp
export const ArrowDownIcon = ArrowDown
export const BackIcon = ArrowLeft
export const NatureIcon = Leaf
export const VenomIcon = Skull
export const FireIcon = Flame
export const MeteorIcon = Rocket
export const AddIcon = Plus
/** Sound *and* vibration: one preference covers both — see `src/ui/feedback/feedback.ts`. */
export const FeedbackOnIcon = Volume2
export const FeedbackOffIcon = VolumeX
