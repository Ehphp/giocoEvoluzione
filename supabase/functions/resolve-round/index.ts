import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import type { ActionType, Environment, RoundValueBreakdown, TraitType } from '../../../src/game/types.ts'

// Scoring stays aligned with src/game/engine.ts through shared pure helpers;
// only persistence and idempotent resolution orchestration remain local here.

type EnvironmentName = Environment
type TraitName = TraitType
type TraitState = { level: number; cooldown: number }
type TraitCollection = Record<TraitName, TraitState>
type PlayerAction = {
    playerId: string
    trait: TraitName
    actionType: 'USE' | 'EVOLVE'
}

const FINAL_ROUND_NUMBER = 6
const ENVIRONMENT_WEIGHT = 2
const MAX_EFFECTIVE_TRAIT_LEVEL = 5

const TRAITS = [
    'STRENGTH',
    'RESISTANCE',
    'AGILITY',
    'PERCEPTION',
    'METABOLISM',
    'ADAPTATION',
    'GRIP_CLAWS',
    'CAMOUFLAGE',
    'WEBBED_LIMBS',
    'FAT_RESERVES',
] as const satisfies readonly TraitName[]

const ENVIRONMENT_MODIFIERS: Record<EnvironmentName, Record<TraitName, number>> = {
    FOREST: {
        STRENGTH: 2,
        RESISTANCE: 0,
        AGILITY: 3,
        PERCEPTION: 2,
        METABOLISM: 0,
        ADAPTATION: 1,
        GRIP_CLAWS: 1,
        CAMOUFLAGE: 3,
        WEBBED_LIMBS: 1,
        FAT_RESERVES: 0,
    },
    MOUNTAIN: {
        STRENGTH: 2,
        RESISTANCE: 3,
        AGILITY: 1,
        PERCEPTION: 0,
        METABOLISM: 1,
        ADAPTATION: 1,
        GRIP_CLAWS: 3,
        CAMOUFLAGE: 0,
        WEBBED_LIMBS: 0,
        FAT_RESERVES: 2,
    },
    SWAMP: {
        STRENGTH: 0,
        RESISTANCE: 1,
        AGILITY: 0,
        PERCEPTION: 2,
        METABOLISM: 3,
        ADAPTATION: 2,
        GRIP_CLAWS: 0,
        CAMOUFLAGE: 1,
        WEBBED_LIMBS: 3,
        FAT_RESERVES: 2,
    },
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: CORS_HEADERS,
    })
}

type PartialTraitCollection = Partial<Record<TraitName, { level?: unknown; cooldown?: unknown } | null | undefined>>

function createInitialTraits(): TraitCollection {
    return TRAITS.reduce<TraitCollection>((collection, trait) => {
        collection[trait] = {
            level: 0,
            cooldown: 0,
        }

        return collection
    }, {} as TraitCollection)
}

function normalizeTraitCollection(traits: PartialTraitCollection | null | undefined): TraitCollection {
    const normalized = createInitialTraits()

    if (!traits) {
        return normalized
    }

    for (const trait of TRAITS) {
        const state = traits[trait]

        if (!state) {
            continue
        }

        if (typeof state.level === 'number') {
            normalized[trait].level = state.level
        }

        if (typeof state.cooldown === 'number') {
            normalized[trait].cooldown = state.cooldown
        }
    }

    return normalized
}

function getValidatedEnvironmentModifier(environment: EnvironmentName, trait: TraitName): number {
    const environmentModifiers = ENVIRONMENT_MODIFIERS[environment]

    if (!environmentModifiers) {
        throw new Error(`Unknown environment "${environment}".`)
    }

    if (!(trait in environmentModifiers)) {
        throw new Error(`Unknown trait "${trait}" for environment "${environment}".`)
    }

    const modifier = environmentModifiers[trait]

    if (!Number.isFinite(modifier) || modifier < 0) {
        throw new Error(`Invalid environment modifier for "${environment}" and trait "${trait}".`)
    }

    return modifier
}

function getValidatedTraitState(traits: TraitCollection, trait: TraitName): TraitState {
    const traitState = traits[trait]

    if (!traitState) {
        throw new Error(`Unknown trait "${trait}".`)
    }

    const { level, cooldown } = traitState

    if (!Number.isFinite(level) || !Number.isFinite(cooldown)) {
        throw new Error(`Invalid trait state for "${trait}": level and cooldown must be finite numbers.`)
    }

    if (level < 0 || cooldown < 0) {
        throw new Error(`Invalid trait state for "${trait}": level and cooldown cannot be negative.`)
    }

    return traitState
}

function getValidatedTraitUseBreakdown(
    environment: EnvironmentName,
    traits: TraitCollection,
    trait: TraitName,
): RoundValueBreakdown {
    const environmentModifier = getValidatedEnvironmentModifier(environment, trait)
    const traitState = getValidatedTraitState(traits, trait)
    const effectiveLevel = Math.min(traitState.level, MAX_EFFECTIVE_TRAIT_LEVEL)
    const environmentContribution = environmentModifier * ENVIRONMENT_WEIGHT
    const levelContribution = effectiveLevel

    return {
        actionType: 'USE',
        environmentModifier,
        environmentWeight: ENVIRONMENT_WEIGHT,
        environmentContribution,
        originalLevel: traitState.level,
        effectiveLevel,
        levelContribution,
        total: environmentContribution + levelContribution,
    }
}

function getValidatedActionBreakdown(
    environment: EnvironmentName,
    traits: TraitCollection,
    trait: TraitName,
    actionType: ActionType,
): RoundValueBreakdown {
    const useBreakdown = getValidatedTraitUseBreakdown(environment, traits, trait)

    if (actionType === 'USE') {
        return useBreakdown
    }

    return {
        ...useBreakdown,
        actionType,
        environmentContribution: 0,
        levelContribution: 0,
        total: 0,
    }
}

function getValidatedTraitRoundValue(environment: EnvironmentName, traits: TraitCollection, trait: TraitName): number {
    return getValidatedTraitUseBreakdown(environment, traits, trait).total
}

function cloneTraits(traits: TraitCollection): TraitCollection {
    return Object.fromEntries(
        Object.entries(traits).map(([trait, state]) => [trait, { ...state }]),
    ) as TraitCollection
}

function tickCooldowns(traits: TraitCollection): TraitCollection {
    const nextTraits = cloneTraits(traits)

    for (const state of Object.values(nextTraits)) {
        state.cooldown = Math.max(0, state.cooldown - 1)
    }

    return nextTraits
}

function getTraitRoundValue(environment: EnvironmentName, traits: TraitCollection, trait: TraitName) {
    return getValidatedTraitRoundValue(environment, traits, trait)
}

function resolvePlayerAction(environment: EnvironmentName, traits: TraitCollection, action: PlayerAction) {
    getValidatedTraitState(traits, action.trait)
    const breakdown = getValidatedActionBreakdown(environment, traits, action.trait, action.actionType)
    const nextTraits = tickCooldowns(traits)

    if (action.actionType === 'EVOLVE') {
        nextTraits[action.trait].level += 1

        return {
            roundValue: 0,
            breakdown,
            traitsAfter: nextTraits,
        }
    }

    if (traits[action.trait].cooldown > 0) {
        throw new Error(`Trait ${action.trait} is on cooldown.`)
    }

    nextTraits[action.trait].cooldown = 1

    return {
        roundValue: getTraitRoundValue(environment, traits, action.trait),
        breakdown,
        traitsAfter: nextTraits,
    }
}

function buildResolution(params: {
    roundNumber: number
    environment: EnvironmentName
    player1Id: string
    player2Id: string
    player1Score: number
    player2Score: number
    player1Traits: TraitCollection
    player2Traits: TraitCollection
    player1Action: PlayerAction
    player2Action: PlayerAction
    startedAt: string | null
}) {
    const player1 = resolvePlayerAction(params.environment, params.player1Traits, params.player1Action)
    const player2 = resolvePlayerAction(params.environment, params.player2Traits, params.player2Action)
    const awardedPoints = params.roundNumber === FINAL_ROUND_NUMBER ? 2 : 1
    const winnerId =
        player1.roundValue === player2.roundValue
            ? null
            : player1.roundValue > player2.roundValue
                ? params.player1Id
                : params.player2Id

    const player1ScoreAfter = params.player1Score + (winnerId === params.player1Id ? awardedPoints : 0)
    const player2ScoreAfter = params.player2Score + (winnerId === params.player2Id ? awardedPoints : 0)
    const player1PointsAwarded = winnerId === params.player1Id ? awardedPoints : 0
    const player2PointsAwarded = winnerId === params.player2Id ? awardedPoints : 0
    const finishedAt = params.roundNumber === FINAL_ROUND_NUMBER ? new Date().toISOString() : null
    const statusAfter = params.roundNumber === FINAL_ROUND_NUMBER ? 'FINISHED' : 'REVEALING'
    const winnerIdAfter =
        params.roundNumber === FINAL_ROUND_NUMBER
            ? player1ScoreAfter === player2ScoreAfter
                ? null
                : player1ScoreAfter > player2ScoreAfter
                    ? params.player1Id
                    : params.player2Id
            : null

    return {
        player_1_value: player1.roundValue,
        player_2_value: player2.roundValue,
        winner_id: winnerId,
        resolution_data: {
            awardedPoints,
            player1Action: params.player1Action,
            player2Action: params.player2Action,
            player1Breakdown: player1.breakdown,
            player2Breakdown: player2.breakdown,
            player1PointsAwarded,
            player2PointsAwarded,
            player1TraitsAfter: player1.traitsAfter,
            player2TraitsAfter: player2.traitsAfter,
            player1ScoreAfter,
            player2ScoreAfter,
            statusAfter,
            winnerIdAfter,
            finishedAt,
            durationMs:
                params.startedAt && finishedAt
                    ? new Date(finishedAt).getTime() - new Date(params.startedAt).getTime()
                    : null,
        },
    }
}

async function applyStoredResolution(
    supabaseAdmin: ReturnType<typeof createClient>,
    gameId: string,
    player1Id: string,
    player2Id: string,
    resolutionData: Record<string, unknown>,
) {
    const player1TraitsAfter = normalizeTraitCollection(resolutionData.player1TraitsAfter as TraitCollection)
    const player2TraitsAfter = normalizeTraitCollection(resolutionData.player2TraitsAfter as TraitCollection)
    const player1ScoreAfter = Number(resolutionData.player1ScoreAfter ?? 0)
    const player2ScoreAfter = Number(resolutionData.player2ScoreAfter ?? 0)
    const statusAfter = String(resolutionData.statusAfter ?? 'REVEALING')
    const winnerIdAfter = (resolutionData.winnerIdAfter as string | null) ?? null
    const finishedAt = (resolutionData.finishedAt as string | null) ?? null

    await Promise.all([
        supabaseAdmin.from('players').update({ traits: player1TraitsAfter, connected: true }).eq('id', player1Id),
        supabaseAdmin.from('players').update({ traits: player2TraitsAfter, connected: true }).eq('id', player2Id),
        supabaseAdmin
            .from('games')
            .update({
                player_1_score: player1ScoreAfter,
                player_2_score: player2ScoreAfter,
                status: statusAfter,
                winner_id: winnerIdAfter,
                finished_at: finishedAt,
            })
            .eq('id', gameId),
    ])
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', {
            headers: CORS_HEADERS,
        })
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        return json({ error: 'Missing Supabase service role configuration.' }, 500)
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    try {
        const body = await request.json()
        const gameId = String(body.gameId ?? '')
        const roundNumber = Number(body.roundNumber ?? 0)

        if (!gameId || !roundNumber) {
            return json({ error: 'gameId and roundNumber are required.' }, 400)
        }

        const { data: gameData, error: gameError } = await supabaseAdmin
            .from('games')
            .select('*')
            .eq('id', gameId)
            .single()

        if (gameError) {
            return json({ error: gameError.message }, 400)
        }

        const { data: playersData, error: playersError } = await supabaseAdmin
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('slot')

        if (playersError) {
            return json({ error: playersError.message }, 400)
        }

        if (!playersData || playersData.length < 2) {
            return json({ status: 'pending', reason: 'waiting_for_players' })
        }

        const player1 = playersData.find((player) => Number(player.slot) === 1)
        const player2 = playersData.find((player) => Number(player.slot) === 2)

        if (!player1 || !player2) {
            return json({ status: 'pending', reason: 'missing_slots' })
        }

        const { data: existingResultData } = await supabaseAdmin
            .from('round_results')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_number', roundNumber)
            .maybeSingle()

        if (existingResultData) {
            await applyStoredResolution(
                supabaseAdmin,
                gameId,
                String(player1.id),
                String(player2.id),
                (existingResultData.resolution_data as Record<string, unknown>) ?? {},
            )

            return json({ status: 'already_resolved', result: existingResultData })
        }

        const { data: actionsData, error: actionsError } = await supabaseAdmin
            .from('round_actions')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_number', roundNumber)

        if (actionsError) {
            return json({ error: actionsError.message }, 400)
        }

        if (!actionsData || actionsData.length < 2) {
            return json({ status: 'pending', reason: 'waiting_for_actions' })
        }

        const player1ActionRow = actionsData.find((action) => action.player_id === player1.id)
        const player2ActionRow = actionsData.find((action) => action.player_id === player2.id)

        if (!player1ActionRow || !player2ActionRow) {
            return json({ status: 'pending', reason: 'missing_player_action' })
        }

        const environment = (gameData.environment_sequence?.[roundNumber - 1] ?? '') as EnvironmentName

        const resolution = buildResolution({
            roundNumber,
            environment,
            player1Id: String(player1.id),
            player2Id: String(player2.id),
            player1Score: Number(gameData.player_1_score ?? 0),
            player2Score: Number(gameData.player_2_score ?? 0),
            player1Traits: normalizeTraitCollection(player1.traits as TraitCollection),
            player2Traits: normalizeTraitCollection(player2.traits as TraitCollection),
            player1Action: {
                playerId: String(player1.id),
                trait: player1ActionRow.trait as TraitName,
                actionType: player1ActionRow.action_type as 'USE' | 'EVOLVE',
            },
            player2Action: {
                playerId: String(player2.id),
                trait: player2ActionRow.trait as TraitName,
                actionType: player2ActionRow.action_type as 'USE' | 'EVOLVE',
            },
            startedAt: (gameData.started_at as string | null) ?? null,
        })

        const { data: insertedResult, error: insertError } = await supabaseAdmin
            .from('round_results')
            .insert({
                game_id: gameId,
                round_number: roundNumber,
                player_1_value: resolution.player_1_value,
                player_2_value: resolution.player_2_value,
                winner_id: resolution.winner_id,
                resolution_data: resolution.resolution_data,
            })
            .select('*')
            .single()

        if (insertError) {
            if (insertError.code === '23505') {
                const { data: duplicateResult } = await supabaseAdmin
                    .from('round_results')
                    .select('*')
                    .eq('game_id', gameId)
                    .eq('round_number', roundNumber)
                    .maybeSingle()

                if (duplicateResult) {
                    await applyStoredResolution(
                        supabaseAdmin,
                        gameId,
                        String(player1.id),
                        String(player2.id),
                        (duplicateResult.resolution_data as Record<string, unknown>) ?? {},
                    )

                    return json({ status: 'already_resolved', result: duplicateResult })
                }
            }

            return json({ error: insertError.message }, 400)
        }

        await applyStoredResolution(
            supabaseAdmin,
            gameId,
            String(player1.id),
            String(player2.id),
            resolution.resolution_data,
        )

        return json({ status: 'resolved', result: insertedResult })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
    }
})