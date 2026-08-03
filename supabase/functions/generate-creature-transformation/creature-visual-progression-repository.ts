import type { CreatureVisualVersion, PreviousCreatureTransformationSummary } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import type { CreatureVisualProgressTrack } from '../../../shared/creature-transformations/visual-progression.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'

type DatabaseError = { message?: string } | null
type Query = PromiseLike<{ data: unknown; error: DatabaseError }> & { eq(column: string, value: unknown): Query; in?(column: string, values: unknown[]): Query; order(column: string, options: { ascending: boolean }): Query; limit(count: number): Query; maybeSingle(): Promise<{ data: unknown; error: DatabaseError }>; select(columns: string): Query }

export interface CreatureVisualProgressionRepositoryClient {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DatabaseError }>
    from(table: string): { select(columns: string): Query }
}

export type StoredVisualVersion = CreatureVisualVersion & Readonly<{ assetPath: string; profileId: string }>
export type GameVisualParticipant = Readonly<{ profileId: string; creatureId: string }>
export type StoredExperimentOnlyResult = Readonly<{ requestId: string; warnings: string[] }>

export class CreatureVisualProgressionRepositoryError extends Error {
    readonly code: string
    constructor(code: string, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureVisualProgressionRepositoryError'
        this.code = code
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function rpcRecord(value: unknown): Record<string, unknown> {
    const result = record(Array.isArray(value) ? value[0] : value)
    if (!result) throw new CreatureVisualProgressionRepositoryError('VISUAL_TRACK_STATE_CONFLICT', 'La risposta persistente della progressione non e valida.')
    return result
}

function string(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null }
function nullableString(value: unknown): string | null { return value === null || value === undefined ? null : string(value) }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [] }

function safeVisualErrorCode(error: unknown, fallback: string): string {
    const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : ''
    const code = message.match(/\b(VISUAL_TRACK_ALREADY_ACTIVE|VISUAL_TRACK_NOT_FOUND|VISUAL_TRACK_NOT_READY|VISUAL_TRACK_STATE_CONFLICT|VISUAL_TRAIT_INVALID|VISUAL_GENERATION_NOT_ADOPTABLE|VISUAL_VERSION_NOT_FOUND|CREATURE_VISUAL_VERSION_CONFLICT|CREATURE_VISUAL_ALREADY_ADOPTED|VISUAL_ROLLBACK_FAILED)\b/)?.[1]
    return code ?? fallback
}

export function mapProgressTrack(value: unknown): CreatureVisualProgressTrack {
    const row = record(value)
    if (!row || !string(row.id) || !string(row.creature_id) || !string(row.visual_trait_id)) throw new CreatureVisualProgressionRepositoryError('VISUAL_TRACK_STATE_CONFLICT', 'La track visuale restituita non e valida.')
    const status = string(row.status)
    if (!status || !['ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED', 'COMPLETED', 'CANCELLED'].includes(status)) throw new CreatureVisualProgressionRepositoryError('VISUAL_TRACK_STATE_CONFLICT', 'Lo stato della track visuale non e valido.')
    return {
        id: string(row.id)!, creatureId: string(row.creature_id)!, visualTraitId: string(row.visual_trait_id)! as VisualTraitId,
        status: status as CreatureVisualProgressTrack['status'], progress: number(row.progress), target: number(row.target),
        readyAt: nullableString(row.ready_at), generatedRequestId: nullableString(row.generated_request_id), completedVersionId: nullableString(row.completed_version_id),
    }
}

export function mapVisualVersion(value: unknown): StoredVisualVersion {
    const row = record(value)
    if (!row || !string(row.id) || !string(row.creature_id) || !string(row.profile_id) || !string(row.asset_path) || !string(row.asset_sha256)) throw new CreatureVisualProgressionRepositoryError('VISUAL_VERSION_NOT_FOUND', 'La versione visuale restituita non e valida.')
    const status = string(row.status)
    if (!status || !['BASE', 'ACTIVE', 'SUPERSEDED', 'REVOKED'].includes(status)) throw new CreatureVisualProgressionRepositoryError('VISUAL_VERSION_NOT_FOUND', 'Lo stato della versione visuale non e valido.')
    return {
        id: string(row.id)!, creatureId: string(row.creature_id)!, profileId: string(row.profile_id)!, versionNumber: number(row.version_number),
        previousVersionId: nullableString(row.previous_version_id), visualTraitId: nullableString(row.visual_trait_id) as VisualTraitId | null,
        conceptName: nullableString(row.concept_name), conceptSnapshot: row.concept_snapshot && typeof row.concept_snapshot === 'object' ? row.concept_snapshot as StoredVisualVersion['conceptSnapshot'] : null,
        promptTemplateVersion: nullableString(row.prompt_template_version), promptSha256: nullableString(row.prompt_sha256), assetPath: string(row.asset_path)!,
        assetSha256: string(row.asset_sha256)!, mimeType: row.mime_type === 'image/png' ? 'image/png' : 'image/png', width: number(row.width), height: number(row.height),
        hasAlpha: row.has_alpha === true, status: status as StoredVisualVersion['status'], adoptedAt: nullableString(row.adopted_at),
    }
}

export class SupabaseCreatureVisualProgressionRepository {
    constructor(private readonly client: CreatureVisualProgressionRepositoryClient) {}

    async selectTrack(input: { profileId: string; creatureId: string; visualTraitId: VisualTraitId; target: number }): Promise<CreatureVisualProgressTrack> {
        return mapProgressTrack(await this.rpc('select_creature_visual_progress_track', {
            p_profile_id: input.profileId, p_creature_id: input.creatureId, p_visual_trait_id: input.visualTraitId, p_target: input.target,
        }))
    }

    async getTrack(input: { profileId: string; creatureId: string }): Promise<CreatureVisualProgressTrack | null> {
        const { data, error } = await this.client.from('creature_visual_progress_tracks').select('*').eq('profile_id', input.profileId).eq('creature_id', input.creatureId).order('started_at', { ascending: false }).limit(1).maybeSingle()
        if (error) throw new CreatureVisualProgressionRepositoryError('VISUAL_TRACK_STATE_CONFLICT', 'Impossibile recuperare la track visuale.', { cause: error })
        return data ? mapProgressTrack(data) : null
    }

    async getLatestExperiment(input: { profileId: string; trackId: string }): Promise<StoredExperimentOnlyResult | null> {
        const { data, error } = await this.client.from('creature_transformation_requests').select('id, asset_readiness, validation_warnings').eq('profile_id', input.profileId).eq('visual_progress_track_id', input.trackId).eq('status', 'SUCCEEDED').eq('asset_readiness', 'EXPERIMENT_ONLY').order('completed_at', { ascending: false }).limit(1).maybeSingle()
        if (error) throw new CreatureVisualProgressionRepositoryError('VISUAL_TRACK_STATE_CONFLICT', 'Impossibile recuperare l esito sperimentale.', { cause: error })
        const row = record(data)
        return row && string(row.id) && row.asset_readiness === 'EXPERIMENT_ONLY'
            ? { requestId: string(row.id)!, warnings: strings(row.validation_warnings) }
            : null
    }

    async getCurrentVersion(input: { profileId: string; creatureId: string }): Promise<StoredVisualVersion | null> {
        const { data, error } = await this.client.from('creature_visual_versions').select('*').eq('profile_id', input.profileId).eq('creature_id', input.creatureId).eq('status', 'ACTIVE').maybeSingle()
        if (error) throw new CreatureVisualProgressionRepositoryError('CURRENT_VISUAL_UNAVAILABLE', 'Impossibile recuperare la visuale corrente.', { cause: error })
        return data ? mapVisualVersion(data) : null
    }

    async getVersion(input: { profileId: string; creatureId: string; versionId: string }): Promise<StoredVisualVersion | null> {
        const { data, error } = await this.client.from('creature_visual_versions').select('*').eq('id', input.versionId).eq('profile_id', input.profileId).eq('creature_id', input.creatureId).maybeSingle()
        if (error) throw new CreatureVisualProgressionRepositoryError('VISUAL_VERSION_NOT_FOUND', 'Impossibile recuperare la versione visuale.', { cause: error })
        return data ? mapVisualVersion(data) : null
    }

    async listHistory(input: { profileId: string; creatureId: string }): Promise<PreviousCreatureTransformationSummary[]> {
        const { data, error } = await this.client.from('creature_visual_versions').select('version_number, visual_trait_id, concept_name').eq('profile_id', input.profileId).eq('creature_id', input.creatureId).order('version_number', { ascending: true }).limit(8)
        if (error) throw new CreatureVisualProgressionRepositoryError('CURRENT_VISUAL_UNAVAILABLE', 'Impossibile recuperare lo storico visuale.', { cause: error })
        const rows = Array.isArray(data) ? data : data ? [data] : []
        return rows.flatMap((row) => {
            const item = record(row)
            return item && string(item.visual_trait_id) && string(item.concept_name)
                ? [{ versionNumber: number(item.version_number), visualTraitId: string(item.visual_trait_id)! as VisualTraitId, conceptName: string(item.concept_name)! }]
                : []
        })
    }

    async listGameHumanParticipants(gameId: string): Promise<GameVisualParticipant[]> {
        const { data, error } = await this.client.from('players').select('profile_id, creature_id, player_type').eq('game_id', gameId)
        if (error) throw new CreatureVisualProgressionRepositoryError('OPPONENT_VISUAL_NOT_AUTHORIZED', 'Impossibile recuperare i partecipanti alla partita.', { cause: error })
        const rows = Array.isArray(data) ? data : []
        return rows.flatMap((row) => {
            const item = record(row)
            return item && item.player_type === 'HUMAN' && string(item.profile_id) && string(item.creature_id)
                ? [{ profileId: string(item.profile_id)!, creatureId: string(item.creature_id)! }]
                : []
        })
    }

    async startGeneration(input: { profileId: string; creatureId: string; trackId: string; requestId: string }): Promise<CreatureVisualProgressTrack> {
        return mapProgressTrack(await this.rpc('start_creature_visual_generation', { p_profile_id: input.profileId, p_creature_id: input.creatureId, p_track_id: input.trackId, p_request_id: input.requestId }))
    }

    async completeGeneration(input: { profileId: string; trackId: string; requestId: string; finalAsset: boolean }): Promise<CreatureVisualProgressTrack> {
        return mapProgressTrack(await this.rpc('complete_creature_visual_generation', { p_profile_id: input.profileId, p_track_id: input.trackId, p_request_id: input.requestId, p_final_asset: input.finalAsset }))
    }

    async markBackgroundRemovalPending(input: { profileId: string; trackId: string; requestId: string }): Promise<CreatureVisualProgressTrack> {
        return mapProgressTrack(await this.rpc('mark_creature_visual_background_removal_pending', {
            p_profile_id: input.profileId, p_track_id: input.trackId, p_request_id: input.requestId,
        }))
    }

    async restoreNonFinalGeneration(input: { profileId: string; trackId: string; requestId: string }): Promise<CreatureVisualProgressTrack> {
        return mapProgressTrack(await this.rpc('restore_nonfinal_creature_visual_generation', {
            p_profile_id: input.profileId, p_track_id: input.trackId, p_request_id: input.requestId,
        }))
    }

    async adopt(input: { profileId: string; creatureId: string; trackId: string; requestId: string; expectedCurrentVisualVersionId: string }): Promise<StoredVisualVersion> {
        return mapVisualVersion(await this.rpc('adopt_creature_transformation', { p_profile_id: input.profileId, p_creature_id: input.creatureId, p_progress_track_id: input.trackId, p_transformation_request_id: input.requestId, p_expected_current_visual_version_id: input.expectedCurrentVisualVersionId }))
    }

    async rollback(input: { profileId: string; creatureId: string; targetVersionId: string; expectedCurrentVisualVersionId: string }): Promise<StoredVisualVersion> {
        return mapVisualVersion(await this.rpc('rollback_creature_visual_version', { p_profile_id: input.profileId, p_creature_id: input.creatureId, p_target_version_id: input.targetVersionId, p_expected_current_visual_version_id: input.expectedCurrentVisualVersionId, p_reason: 'OWNER_CONFIRMED' }))
    }

    private async rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
        try {
            const { data, error } = await this.client.rpc(name, args)
            if (error) throw error
            return rpcRecord(data)
        } catch (error) {
            throw new CreatureVisualProgressionRepositoryError(safeVisualErrorCode(error, 'VISUAL_TRACK_STATE_CONFLICT'), 'La transizione visuale non e riuscita.', { cause: error })
        }
    }
}
