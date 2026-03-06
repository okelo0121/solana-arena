import React, { useState, useEffect } from 'react';
import { useSolanaArena } from '../hooks/useSolanaArena';
import { PublicKey } from '@solana/web3.js';

export default function RoundTimer() {
    const { program } = useSolanaArena();
    const [roundInfo, setRoundInfo] = useState({
        timeRemaining: '--:--:--',
        isActive: false,
        isLoading: true
    });

    const formatTimeRemaining = (endTime) => {
        if (!endTime) return '--:--:--';
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;
        if (diff <= 0) return '00:00:00';
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!program) return;

        const fetchRoundInfo = async () => {
            try {
                const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
                const roundData = await program.account.arenaRound.fetch(arenaRoundPda);
                setRoundInfo({
                    endTime: roundData.endTime.toNumber(),
                    timeRemaining: formatTimeRemaining(roundData.endTime.toNumber()),
                    isActive: roundData.isActive,
                    isLoading: false
                });
            } catch (e) {
                console.error("Failed to fetch round info:", e);
                setRoundInfo(prev => ({ ...prev, isLoading: false }));
            }
        };

        fetchRoundInfo();
        const interval = setInterval(fetchRoundInfo, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [program]);

    useEffect(() => {
        if (!roundInfo.endTime || !roundInfo.isActive) return;

        const timer = setInterval(() => {
            setRoundInfo(prev => ({
                ...prev,
                timeRemaining: formatTimeRemaining(prev.endTime)
            }));
        }, 1000);

        return () => clearInterval(timer);
    }, [roundInfo.endTime, roundInfo.isActive]);

    if (roundInfo.isLoading) {
        return (
            <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-text-muted">
                <span className="material-symbols-outlined text-sm md:text-base animate-spin">refresh</span>
                <span className="hidden sm:inline">Loading...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 py-1.5 md:py-2 rounded-lg bg-surface-dark/50 border border-border-dark">
            <span className="material-symbols-outlined text-primary text-sm md:text-base">timer</span>
            <span className="hidden sm:inline text-xs text-text-muted uppercase tracking-wider">
                {roundInfo.isActive ? 'Round Ends' : 'Next Round'}
            </span>
            <div className="digital-font text-base md:text-lg font-bold text-primary tabular-nums">
                {roundInfo.isActive ? roundInfo.timeRemaining : 'Soon'}
            </div>
            {roundInfo.isActive && (
                <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-full w-full bg-primary"></span>
                </span>
            )}
        </div>
    );
}
