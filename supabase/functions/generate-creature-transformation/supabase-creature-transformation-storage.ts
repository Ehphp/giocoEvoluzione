import { sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'

export const CREATURE_TRANSFORMATION_SOURCE_BUCKET = 'creature-transformation-sources'
export const CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET = 'creature-transformation-experiments'

type StorageError = { message?: string } | null

type StorageBucketClient = {
    download(path: string): Promise<{ data: Blob | null; error: StorageError }>
    upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ error: StorageError }>
    createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl?: string } | null; error: StorageError }>
}

export interface CreatureTransformationStorageClient {
    from(bucket: string): StorageBucketClient
}

export type CanonicalCreatureSourceImage = Readonly<{
    bytes: Uint8Array
    mimeType: 'image/png'
}>

export type StoredCreatureTransformationImage = Readonly<{
    signedUrl: string
    expiresAt: string
}>

export type CreatureTransformationStorageAdapterOptions = Readonly<{
    sourceBucket?: string
    experimentBucket?: string
    signedUrlTtlSeconds?: number
    now?: () => number
}>

export type CreatureTransformationStorageErrorCode =
    | 'SOURCE_IMAGE_NOT_FOUND'
    | 'STORAGE_UPLOAD_FAILED'
    | 'SIGNED_URL_FAILED'

export class CreatureTransformationStorageError extends Error {
    readonly code: CreatureTransformationStorageErrorCode

    constructor(code: CreatureTransformationStorageErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureTransformationStorageError'
        this.code = code
    }
}

function profilePathSegment(profileId: string): string {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(profileId)) {
        throw new CreatureTransformationStorageError('STORAGE_UPLOAD_FAILED', 'Il profilo autenticato non puo essere usato per il path del risultato.')
    }
    return profileId
}

function isSafeResultObjectPath(path: string): boolean {
    return /^[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}\.png$/.test(path)
        || /^experiments\/raw\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}\.png$/.test(path)
        || /^candidates\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}\.png$/.test(path)
        || /^cleanup\/[a-f0-9]{64}\.png$/.test(path)
        || /^display\/[a-f0-9]{64}\.webp$/.test(path)
}

export class SupabaseCreatureTransformationStorageAdapter {
    private static readonly signedUrlCache = new Map<string, StoredCreatureTransformationImage>()
    private readonly client: CreatureTransformationStorageClient
    private readonly sourceBucket: string
    private readonly experimentBucket: string
    private readonly signedUrlTtlSeconds: number
    private readonly now: () => number

    constructor(client: CreatureTransformationStorageClient, options: CreatureTransformationStorageAdapterOptions = {}) {
        this.client = client
        this.sourceBucket = options.sourceBucket ?? CREATURE_TRANSFORMATION_SOURCE_BUCKET
        this.experimentBucket = options.experimentBucket ?? CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET
        this.signedUrlTtlSeconds = options.signedUrlTtlSeconds ?? 300
        this.now = options.now ?? (() => Date.now())
    }

    async readCanonicalSource(sourceImagePath: string, isBaseVersion = true): Promise<CanonicalCreatureSourceImage> {
        let result: { data: Blob | null; error: StorageError }
        try {
            result = await this.client.from(isBaseVersion ? this.sourceBucket : this.experimentBucket).download(sourceImagePath)
        } catch (error) {
            throw new CreatureTransformationStorageError('SOURCE_IMAGE_NOT_FOUND', 'La sorgente canonica non e disponibile.', { cause: error })
        }
        if (result.error || !result.data) {
            throw new CreatureTransformationStorageError('SOURCE_IMAGE_NOT_FOUND', 'La sorgente canonica non e disponibile.', { cause: result.error ?? undefined })
        }
        return {
            bytes: new Uint8Array(await result.data.arrayBuffer()),
            mimeType: 'image/png',
        }
    }

    async createResultObjectPath(profileId: string, idempotencyKey: string): Promise<string> {
        const profileSegment = profilePathSegment(profileId)
        const idempotencyDigest = await sha256Hex(new TextEncoder().encode(idempotencyKey))
        return `${profileSegment}/${idempotencyDigest}.png`
    }

    async createRawResultObjectPath(profileId: string, idempotencyKey: string): Promise<string> {
        const profileSegment = profilePathSegment(profileId)
        const idempotencyDigest = await sha256Hex(new TextEncoder().encode(idempotencyKey))
        return `experiments/raw/${profileSegment}/${idempotencyDigest}.png`
    }

    async createCandidateObjectPath(profileId: string, requestId: string): Promise<string> {
        const profileSegment = profilePathSegment(profileId)
        const requestDigest = await sha256Hex(new TextEncoder().encode(requestId))
        return `candidates/${profileSegment}/${requestDigest}.png`
    }

    async createCleanupObjectPath(visualVersionId: string): Promise<string> {
        const digest = await sha256Hex(new TextEncoder().encode(visualVersionId))
        return `cleanup/${digest}.png`
    }

    async createDisplayObjectPath(key: string): Promise<string> {
        const digest = await sha256Hex(new TextEncoder().encode(key))
        return `display/${digest}.webp`
    }

    async saveResult(input: {
        profileId: string
        idempotencyKey: string
        image: Uint8Array
    }): Promise<StoredCreatureTransformationImage> {
        const objectPath = await this.createResultObjectPath(input.profileId, input.idempotencyKey)
        return this.savePng(objectPath, input.image)
    }

    async saveRawResult(input: { profileId: string; idempotencyKey: string; image: Uint8Array }): Promise<StoredCreatureTransformationImage> {
        return this.savePng(await this.createRawResultObjectPath(input.profileId, input.idempotencyKey), input.image)
    }

    async saveBackgroundRemovalCandidate(input: { profileId: string; transformationRequestId: string; image: Uint8Array }): Promise<StoredCreatureTransformationImage> {
        return this.savePng(await this.createCandidateObjectPath(input.profileId, input.transformationRequestId), input.image)
    }

    async saveCleanedVisual(input: { visualVersionId: string; image: Uint8Array }): Promise<StoredCreatureTransformationImage> {
        return this.savePng(await this.createCleanupObjectPath(input.visualVersionId), input.image)
    }

    async saveDisplayAsset(input: { key: string; image: Uint8Array }): Promise<StoredCreatureTransformationImage> {
        return this.saveImage(await this.createDisplayObjectPath(input.key), input.image, 'image/webp')
    }

    private async savePng(objectPath: string, image: Uint8Array): Promise<StoredCreatureTransformationImage> {
        return this.saveImage(objectPath, image, 'image/png')
    }

    private async saveImage(objectPath: string, image: Uint8Array, contentType: 'image/png' | 'image/webp'): Promise<StoredCreatureTransformationImage> {
        let upload: { error: StorageError }
        try {
            upload = await this.client.from(this.experimentBucket).upload(objectPath, image, {
                contentType,
                upsert: true,
            })
        } catch (error) {
            throw new CreatureTransformationStorageError('STORAGE_UPLOAD_FAILED', 'Non e stato possibile salvare il risultato della trasformazione.', { cause: error })
        }
        if (upload.error) {
            throw new CreatureTransformationStorageError('STORAGE_UPLOAD_FAILED', 'Non e stato possibile salvare il risultato della trasformazione.', { cause: upload.error })
        }

        return this.createResultSignedUrl(objectPath)
    }

    async createResultSignedUrl(resultPath: string): Promise<StoredCreatureTransformationImage> {
        if (!isSafeResultObjectPath(resultPath)) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Il path persistito del risultato non e valido.')
        }
        let signed: { data: { signedUrl?: string } | null; error: StorageError }
        try {
            signed = await this.client.from(this.experimentBucket).createSignedUrl(resultPath, this.signedUrlTtlSeconds)
        } catch (error) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Non e stato possibile creare il link temporaneo del risultato.', { cause: error })
        }
        if (signed.error || !signed.data?.signedUrl) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Non e stato possibile creare il link temporaneo del risultato.', { cause: signed.error ?? undefined })
        }

        return {
            signedUrl: signed.data.signedUrl,
            expiresAt: new Date(this.now() + this.signedUrlTtlSeconds * 1000).toISOString(),
        }
    }

    async createVisualVersionSignedUrl(input: { assetPath: string; isBaseVersion: boolean }): Promise<StoredCreatureTransformationImage> {
        const isCleanupPath = /^cleanup\/[a-f0-9]{64}\.png$/.test(input.assetPath)
        const bucket = !input.isBaseVersion || isCleanupPath ? this.experimentBucket : this.sourceBucket
        const cacheKey = `${bucket}:${input.assetPath}`
        const cached = SupabaseCreatureTransformationStorageAdapter.signedUrlCache.get(cacheKey)
        if (cached && Date.parse(cached.expiresAt) - this.now() > 30_000) return cached
        if (input.isBaseVersion && !isCleanupPath && !/^[A-Za-z0-9._/-]{1,512}$/.test(input.assetPath)) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'La sorgente visuale non e valida.')
        }
        if (!input.isBaseVersion && !isSafeResultObjectPath(input.assetPath)) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Il path della versione visuale non e valido.')
        }
        let signed: { data: { signedUrl?: string } | null; error: StorageError }
        try {
            signed = await this.client.from(bucket).createSignedUrl(input.assetPath, this.signedUrlTtlSeconds)
        } catch (error) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Non e stato possibile creare il link temporaneo della visuale.', { cause: error })
        }
        if (signed.error || !signed.data?.signedUrl) {
            throw new CreatureTransformationStorageError('SIGNED_URL_FAILED', 'Non e stato possibile creare il link temporaneo della visuale.', { cause: signed.error ?? undefined })
        }
        const result = { signedUrl: signed.data.signedUrl, expiresAt: new Date(this.now() + this.signedUrlTtlSeconds * 1000).toISOString() }
        SupabaseCreatureTransformationStorageAdapter.signedUrlCache.set(cacheKey, result)
        return result
    }
}
