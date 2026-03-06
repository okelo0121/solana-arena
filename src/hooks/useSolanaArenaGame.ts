import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection } from '@solana/web3.js';
import {
    PROGRAM_ID,
    SEEDS,
    RoundStatus,
    getArenaConfigPDA,
    getArenaRoundPDA,
    getPlayerSessionPDA,
    getPlayerProfilePDA,
    DEFAULT_CONFIG,
    formatCountdown,
    canStartRound,
    canFinalizeRound,
    calculatePrizes,
} from '../utils/pda';

/**
 * Simplified hook for the Survival Trading Arena
 * 
 * NOTE: After deploying the new smart contract, you need to:
 * 1. Run `anchor build` to generate new IDL
 * 2. Copy the new IDL to src/idl.json
 * 3. Update the accounts in the fetch methods
 */

export function useSolanaArenaGame() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const [roundData, setRoundData] = useState<any>(null);
    const [sessionData, setSessionData] = useState<any>(null);
    const [profileData, setProfileData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Current round ID
    const [currentRoundId] = useState(1);

    // Fetch round data from on-chain
    const fetchRoundData = useCallback(async () => {
        if (!connection) return;

        try {
            const [roundPDA] = await getArenaRoundPDA(currentRoundId);
            const accountInfo = await connection.getParsedAccountInfo(roundPDA);

            if (accountInfo.value && accountInfo.value.data) {
                // Parse the account data - simplified for demo
                // In production, use the actual IDL deserializer
                setRoundData({
                    exists: true,
                    pubkey: roundPDA.toString(),
                });
            } else {
                setRoundData({ exists: false });
            }
        } catch (err) {
            console.error('Error fetching round:', err);
            setRoundData({ exists: false });
        }
    }, [connection, currentRoundId]);

    // Fetch player session
    const fetchSessionData = useCallback(async () => {
        if (!connection || !publicKey) return;

        try {
            const [sessionPDA] = await getPlayerSessionPDA(currentRoundId, publicKey);
            const accountInfo = await connection.getParsedAccountInfo(sessionPDA);

            if (accountInfo.value && accountInfo.value.data) {
                setSessionData({
                    exists: true,
                    pubkey: sessionPDA.toString(),
                });
            } else {
                setSessionData({ exists: false });
            }
        } catch (err) {
            console.error('Error fetching session:', err);
            setSessionData({ exists: false });
        }
    }, [connection, publicKey, currentRoundId]);

    // Poll for updates
    useEffect(() => {
        fetchRoundData();
        fetchSessionData();

        const interval = setInterval(() => {
            fetchRoundData();
            fetchSessionData();
        }, 3000);

        return () => clearInterval(interval);
    }, [fetchRoundData, fetchSessionData]);

    // Join Lobby - Creates transaction data for frontend
    const prepareJoinLobby = useCallback(() => {
        if (!publicKey) {
            throw new Error('Wallet not connected');
        }

        // This returns the transaction data that would be sent
        // Actual implementation would use the program.methods
        return {
            type: 'join_lobby',
            roundId: currentRoundId,
            player: publicKey.toString(),
            entryFee: DEFAULT_CONFIG.entryFee,
        };
    }, [publicKey, currentRoundId]);

    // Execute Trade - Returns trade parameters
    const prepareTrade = useCallback((
        side: 'long' | 'short',
        size: number,
        leverage: number,
        currentPrice: number
    ) => {
        if (!publicKey) {
            throw new Error('Wallet not connected');
        }

        if (!sessionData?.exists) {
            throw new Error('Not joined the arena');
        }

        return {
            type: 'execute_trade',
            roundId: currentRoundId,
            player: publicKey.toString(),
            side: side === 'long' ? 1 : 2,
            size,
            leverage,
            currentPrice,
        };
    }, [publicKey, sessionData, currentRoundId]);

    // Lock and Start Round
    const prepareLockRound = useCallback(() => {
        return {
            type: 'lock_and_start',
            roundId: currentRoundId,
        };
    }, [currentRoundId]);

    // Finalize Round
    const prepareFinalizeRound = useCallback(() => {
        return {
            type: 'finalize_round',
            roundId: currentRoundId,
        };
    }, [currentRoundId]);

    // Game state helpers
    const gameState = {
        isLoading,
        error,
        hasRound: roundData?.exists ?? false,
        hasSession: sessionData?.exists ?? false,
        currentRoundId,

        // These would come from actual on-chain data after IDL update
        roundStatus: 'lobby' as 'lobby' | 'live' | 'finished',
        lobbyTimeRemaining: '--:--:--',
        roundTimeRemaining: '--:--:--',
        totalPlayers: 0,
        alivePlayers: 0,
        prizePool: 0,

        // Session state
        virtualBalance: 100000000, // $100 default
        positionSide: 0,
        positionSize: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        eliminated: false,

        // Profile
        totalWins: 0,
        firstPlace: 0,
        secondPlace: 0,
        thirdPlace: 0,
        totalEarnings: 0,
    };

    // Actions (these are prepared but need actual program call)
    const actions = {
        joinLobby: prepareJoinLobby,
        executeTrade: prepareTrade,
        lockRound: prepareLockRound,
        finalizeRound: prepareFinalizeRound,
        refresh: () => {
            fetchRoundData();
            fetchSessionData();
        },
    };

    return {
        ...gameState,
        ...actions,
    };
}

// ============================================================================
// SIMPLIFIED TYPES FOR FRONTEND
// ============================================================================

export interface GameState {
    isLoading: boolean;
    error: string | null;
    hasRound: boolean;
    hasSession: boolean;
    currentRoundId: number;
    roundStatus: 'lobby' | 'live' | 'finished';
    lobbyTimeRemaining: string;
    roundTimeRemaining: string;
    totalPlayers: number;
    alivePlayers: number;
    prizePool: number;
    virtualBalance: number;
    positionSide: number;
    positionSize: number;
    unrealizedPnl: number;
    realizedPnl: number;
    eliminated: boolean;
    totalWins: number;
    firstPlace: number;
    secondPlace: number;
    thirdPlace: number;
    totalEarnings: number;
}

export interface GameActions {
    joinLobby: () => any;
    executeTrade: (side: 'long' | 'short', size: number, leverage: number, currentPrice: number) => any;
    lockRound: () => any;
    finalizeRound: () => any;
    refresh: () => void;
}

// ============================================================================
// UI HELPERS
// ============================================================================

export function useGameUI() {
    const game = useSolanaArenaGame();

    // Determine UI state
    const canJoin = !game.hasSession && game.roundStatus === 'lobby';
    const canTrade = game.hasSession && game.roundStatus === 'live' && !game.eliminated && game.positionSide === 0;
    const canLock = game.roundStatus === 'lobby';
    const canFinalize = game.roundStatus === 'live';

    // Status display
    const statusDisplay = {
        lobby: {
            label: 'LOBBY OPEN',
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-400/10',
        },
        live: {
            label: 'LIVE',
            color: 'text-primary',
            bgColor: 'bg-primary/10',
        },
        finished: {
            label: 'FINISHED',
            color: 'text-slate-400',
            bgColor: 'bg-slate-400/10',
        },
    };

    const currentStatus = statusDisplay[game.roundStatus];

    // Prize display
    const prizeDisplay = game.prizePool > 0 ? {
        first: Math.floor(game.prizePool * 0.5),
        second: Math.floor(game.prizePool * 0.3),
        third: Math.floor(game.prizePool * 0.2),
        pool: game.prizePool,
    } : null;

    return {
        ...game,
        canJoin,
        canTrade,
        canLock,
        canFinalize,
        statusDisplay: currentStatus,
        prizeDisplay,
    };
}
