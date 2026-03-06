import { PublicKey } from '@solana/web3.js';

// Program ID - update after deployment
export const PROGRAM_ID = new PublicKey('FLDK6cFtbf15bd88aVGYmWsGd4btFzyUuJjwV2urpw4y');

// PDA Seeds
export const SEEDS = {
    CONFIG: 'config',
    ROUND: 'round',
    SESSION: 'session',
    PROFILE: 'profile',
    VAULT: 'vault',
};

// Derive Arena Config PDA
export async function getArenaConfigPDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
        [Buffer.from(SEEDS.CONFIG)],
        PROGRAM_ID
    );
}

// Derive Arena Round PDA
export async function getArenaRoundPDA(roundId: number): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
        [Buffer.from(SEEDS.ROUND), Buffer.from(new Uint8Array(new Uint32Array([roundId]).buffer))],
        PROGRAM_ID
    );
}

// Derive Player Session PDA
export async function getPlayerSessionPDA(
    roundId: number,
    playerPubkey: PublicKey
): Promise<[PublicKey, number]> {
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setUint64(0, BigInt(roundId), true);

    return PublicKey.findProgramAddress(
        [Buffer.from(SEEDS.SESSION), roundIdBytes, playerPubkey.toBytes()],
        PROGRAM_ID
    );
}

// Derive Player Profile PDA
export async function getPlayerProfilePDA(
    playerPubkey: PublicKey
): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
        [Buffer.from(SEEDS.PROFILE), playerPubkey.toBytes()],
        PROGRAM_ID
    );
}

// Derive Vault PDA for holding entry fees
export async function getVaultPDA(roundId: number): Promise<[PublicKey, number]> {
    const roundIdBytes = new Uint8Array(8);
    new DataView(roundIdBytes.buffer).setUint64(0, BigInt(roundId), true);

    return PublicKey.findProgramAddress(
        [Buffer.from(SEEDS.VAULT), roundIdBytes],
        PROGRAM_ID
    );
}

// Round Status Enum (matches Rust)
export enum RoundStatus {
    Lobby = 0,
    Live = 1,
    Finished = 2,
}

// Position Side Enum
export enum PositionSide {
    None = 0,
    Long = 1,
    Short = 2,
}

// Interface for Arena Config
export interface ArenaConfigData {
    initialized: boolean;
    entryFee: number;
    lobbyDurationSec: number;
    roundDurationSec: number;
    feeBps: number;
    treasury: PublicKey;
}

// Interface for Arena Round
export interface ArenaRoundData {
    roundId: number;
    status: RoundStatus;
    lobbyEndTs: number;
    roundEndTs: number;
    totalPlayers: number;
    alivePlayers: number;
    prizePool: number;
    finalized: boolean;
    topPlayers: PublicKey[];
    topBalances: number[];
    winners: PublicKey[];
    winnerPrizes: number[];
}

// Interface for Player Session
export interface PlayerSessionData {
    owner: PublicKey;
    roundId: number;
    virtualBalance: number;
    positionSide: PositionSide;
    positionSize: number;
    entryPrice: number;
    leverage: number;
    unrealizedPnl: number;
    realizedPnl: number;
    eliminated: boolean;
    eliminationTs: number;
    joinTs: number;
}

// Interface for Player Profile
export interface PlayerProfileData {
    owner: PublicKey;
    totalWins: number;
    firstPlaceCount: number;
    secondPlaceCount: number;
    thirdPlaceCount: number;
    totalEarnings: number;
}

// Default config values for MVP
export const DEFAULT_CONFIG = {
    entryFee: 100000000, // 0.1 SOL (100M lamports)
    lobbyDurationSec: 300, // 5 minutes
    roundDurationSec: 900, // 15 minutes
    feeBps: 500, // 5% platform fee
};

// Helper to format lamports to SOL
export function lamportsToSol(lamports: number): number {
    return lamports / 1e9;
}

// Helper to format SOL to lamports
export function solToLamports(sol: number): number {
    return Math.floor(sol * 1e9);
}

// Helper to format Unix timestamp to countdown string
export function formatCountdown(endTs: number): string {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTs - now;

    if (remaining <= 0) return '00:00:00';

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Helper to check if round can be started
export function canStartRound(lobbyEndTs: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now >= lobbyEndTs;
}

// Helper to check if round can be finalized
export function canFinalizeRound(
    roundEndTs: number,
    alivePlayers: number,
    status: RoundStatus
): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (status === RoundStatus.Live) &&
        (now >= roundEndTs || alivePlayers <= 3);
}

// Prize distribution percentages (in basis points)
export const PRIZE_DISTRIBUTION = {
    FIRST: 5000, // 50%
    SECOND: 3000, // 30%
    THIRD: 2000, // 20%
};

// Calculate prizes from pool
export function calculatePrizes(totalPool: number, feeBps: number): {
    first: number;
    second: number;
    third: number;
    fee: number;
} {
    const fee = Math.floor(totalPool * feeBps / 10000);
    const distributable = totalPool - fee;

    return {
        fee,
        first: Math.floor(distributable * PRIZE_DISTRIBUTION.FIRST / 10000),
        second: Math.floor(distributable * PRIZE_DISTRIBUTION.SECOND / 10000),
        third: Math.floor(distributable * PRIZE_DISTRIBUTION.THIRD / 10000),
    };
}
