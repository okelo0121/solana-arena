import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolanaArena } from '../hooks/useSolanaArena';
import { PublicKey } from '@solana/web3.js';

export default function TournamentResults() {
    const navigate = useNavigate();
    const wallet = useAnchorWallet();
    const { program } = useSolanaArena();

    const [roundInfo, setRoundInfo] = useState({
        endTime: null,
        timeRemaining: '00:00:00',
        isActive: false
    });

    const [topWinners, setTopWinners] = useState([
        { rank: 2, address: null, balance: 0 },
        { rank: 1, address: null, balance: 0 },
        { rank: 3, address: null, balance: 0 }
    ]);

    const [userStats, setUserStats] = useState({
        balance: 0,
        realizedPnl: 0,
        rank: null,
        isTop3: false
    });

    const formatTimeRemaining = (endTime) => {
        if (!endTime) return '00:00:00';
        const now = Math.floor(Date.now() / 1000);
        const diff = endTime - now;
        if (diff <= 0) return '00:00:00';
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatAddress = (address) => {
        if (!address) return '---';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    };

    const calculateGain = (balance) => {
        const initialBalance = 10000; // $10,000 starting balance
        if (balance <= 0) return '+0.0%';
        const gain = ((balance - initialBalance) / initialBalance) * 100;
        const sign = gain >= 0 ? '+' : '';
        return `${sign}${gain.toFixed(1)}%`;
    };

    const syncRoundInfo = useCallback(async () => {
        if (!program) return;
        try {
            const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
            const roundData = await program.account.arenaRound.fetch(arenaRoundPda);
            setRoundInfo({
                endTime: roundData.endTime.toNumber(),
                timeRemaining: formatTimeRemaining(roundData.endTime.toNumber()),
                isActive: roundData.isActive
            });

            // Update top winners from contract
            const winners = [];
            for (let i = 0; i < 3; i++) {
                const player = roundData.topPlayers[i];
                const balance = roundData.topBalances[i];
                if (player && !player.equals(PublicKey.default)) {
                    winners.push({
                        rank: i + 1,
                        address: player.toString(),
                        balance: balance / 1_000_000 // Convert from 6 decimals
                    });
                }
            }
            // Sort by rank and fill empty slots
            const sorted = [
                winners.find(w => w.rank === 2) || { rank: 2, address: null, balance: 0 },
                winners.find(w => w.rank === 1) || { rank: 1, address: null, balance: 0 },
                winners.find(w => w.rank === 3) || { rank: 3, address: null, balance: 0 }
            ];
            setTopWinners(sorted);

            // Calculate user's rank if wallet connected
            if (wallet) {
                await syncUserStats(sorted);
            }
        } catch (e) {
            console.error("Failed to sync round info:", e);
        }
    }, [program, wallet]);

    const syncUserStats = useCallback(async (currentWinners) => {
        if (!program || !wallet) return;
        try {
            const [playerSessionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("session"), wallet.publicKey.toBuffer()],
                program.programId
            );
            const sessionData = await program.account.playerSession.fetch(playerSessionPda);
            const balance = sessionData.virtualBalance / 1_000_000;
            const realizedPnl = sessionData.realizedPnl / 1_000_000;

            // Calculate rank by comparing with top 3
            let rank = null;
            let isTop3 = false;

            // Check if user is in top 3
            for (let i = 0; i < 3; i++) {
                if (currentWinners[i]?.address === wallet.publicKey.toString()) {
                    rank = i + 1;
                    isTop3 = true;
                    break;
                }
            }

            // If not in top 3, estimate rank as 4+ (actual rank would require querying all players)
            if (!rank && balance > 0) {
                rank = 4; // Estimated
            }

            setUserStats({
                balance,
                realizedPnl,
                rank,
                isTop3
            });
        } catch (e) {
            console.error("Failed to sync user stats:", e);
        }
    }, [program, wallet]);

    const updateLeaderboard = useCallback(async () => {
        if (!program || !wallet) return;
        try {
            const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
            const [playerSessionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("session"), wallet.publicKey.toBuffer()],
                program.programId
            );

            await program.methods.updateLeaderboard()
                .accounts({
                    arenaRound: arenaRoundPda,
                    playerSession: playerSessionPda,
                    player: wallet.publicKey
                })
                .rpc();

            // Refresh winners after updating
            await syncRoundInfo();
        } catch (e) {
            console.error("Failed to update leaderboard:", e);
        }
    }, [program, wallet, syncRoundInfo]);

    useEffect(() => {
        syncRoundInfo();
    }, [syncRoundInfo]);

    useEffect(() => {
        if (!roundInfo.endTime) return;
        const interval = setInterval(() => {
            setRoundInfo(prev => ({
                ...prev,
                timeRemaining: formatTimeRemaining(prev.endTime)
            }));
        }, 1000);
        return () => clearInterval(interval);
    }, [roundInfo.endTime]);

    // Update leaderboard when user visits page
    useEffect(() => {
        if (wallet && program) {
            updateLeaderboard();
        }
    }, [wallet, program, updateLeaderboard]);

    return (
        <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen selection:bg-primary selection:text-background-dark">
            <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
                {/* Navigation */}
                <header className="flex items-center justify-between border-b border-white/10 px-4 md:px-6 py-3 md:py-4 lg:px-20">
                    <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
                        <span className="material-symbols-outlined text-primary text-2xl md:text-3xl">arrow_back</span>
                        <h2 className="text-lg md:text-xl font-bold tracking-tight hidden sm:block">Back to Arena</h2>
                    </button>
                    <nav className="hidden md:flex items-center gap-8">
                        <button onClick={() => navigate('/dashboard')} className="text-sm font-medium hover:text-primary transition-colors">Trading</button>
                        <button onClick={() => navigate('/tournament')} className="text-sm font-medium hover:text-primary transition-colors text-primary border-b-2 border-primary pb-1">Leaderboard</button>
                    </nav>
                    <div className="flex items-center gap-2 md:gap-4">
                        <WalletMultiButton className="!bg-primary !text-background-dark !px-4 md:!px-6 !py-2 !rounded-lg !text-xs md:!text-sm !font-bold !transition-all !shadow-[0_0_20px_rgba(6,249,6,0.3)]" />
                        <div className="hidden sm:block w-10 h-10 rounded-full border-2 border-primary/30 bg-cover bg-center" data-alt="User profile avatar neon style" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAT5BsEhhGPyn8USk0UNv4jWkyzONi_fchnKQWFt1MAVNzLCVtt842U116MSsc9xuLTou8f7CyTPlRhys7vbspevkqPzFIffoeGvhedy9dnyxwZwsO-JqwpWXhKsYU3VT0BVXlQaIu3DC2abF96h8S9jT2eo9UrN07VldEfICBvJo4SHTxXNRbZLmHfMAoVB2TYmGSvyrrmVAPdjLz3JYxnUVfvVO6HFE_0Y5sjlWlfwdrE5c5TPYZEDZaiX3BnImPazXVyzYUJOddu')" }}></div>
                    </div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-start py-12 px-4 relative">
                    {/* Background Spotlights */}
                    <div className="absolute top-0 left-1/4 w-[600px] h-[600px] spotlight-green -z-10"></div>
                    <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] spotlight-purple -z-10"></div>

                    {/* Title Section */}
                    <div className="text-center mb-8 md:mb-16 px-4">
                        <h1 className="text-3xl md:text-5xl lg:text-7xl font-black italic uppercase tracking-tighter mb-2">Tournament Results</h1>
                        <p className="text-slate-400 text-sm md:text-lg">
                            Solana Arena Season 1 Final Standings •
                            <span className="text-primary font-bold ml-2 block sm:inline mt-1 sm:mt-0">
                                {roundInfo.isActive ? `Round ends in ${roundInfo.timeRemaining}` : 'Round Ended'}
                            </span>
                        </p>
                    </div>

                    {/* Podium Section */}
                    <div className="flex flex-col md:flex-row items-end justify-center gap-4 lg:gap-8 w-full max-w-6xl mb-20 px-4">
                        {/* 2nd Place */}
                        <div className="flex flex-col items-center w-full md:w-64 order-2 md:order-1">
                            <div className="mb-4 text-slate-300 flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-4xl text-slate-400">workspace_premium</span>
                                <p className="text-sm font-mono bg-white/5 px-3 py-1 rounded-full border border-white/10">{formatAddress(topWinners[0]?.address)}</p>
                                <p className="text-2xl font-bold text-slate-200">{calculateGain(topWinners[0]?.balance)}</p>
                            </div>
                            <div className="w-full h-40 bg-white/5 border-t border-x border-white/20 rounded-t-xl relative overflow-hidden flex flex-col items-center justify-center">
                                <div className="absolute inset-0 podium-gradient opacity-30"></div>
                                <span className="text-6xl font-black text-white/10">2</span>
                                <div className="absolute -top-12 animate-bounce">
                                    <span className="material-symbols-outlined text-5xl text-slate-400 drop-shadow-[0_0_10px_rgba(148,163,184,0.5)]">emoji_events</span>
                                </div>
                            </div>
                        </div>

                        {/* 1st Place */}
                        <div className="flex flex-col items-center w-full md:w-80 order-1 md:order-2">
                            <div className="mb-6 text-primary flex flex-col items-center gap-2">
                                <div className="relative">
                                    <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full"></div>
                                    <span className="material-symbols-outlined text-7xl relative">military_tech</span>
                                </div>
                                <p className="text-base font-mono bg-primary/10 px-4 py-1.5 rounded-full border border-primary/30">{formatAddress(topWinners[1]?.address)}</p>
                                <p className="text-4xl font-black text-primary drop-shadow-[0_0_10px_rgba(6,249,6,0.5)]">{calculateGain(topWinners[1]?.balance)}</p>
                            </div>
                            <div className="w-full h-64 bg-primary/5 border-t border-x border-primary/40 rounded-t-xl relative overflow-hidden flex flex-col items-center justify-center">
                                <div className="absolute inset-0 podium-gradient opacity-50"></div>
                                <span className="text-8xl font-black text-primary/20">1</span>
                                <div className="absolute -top-16">
                                    <span className="material-symbols-outlined text-8xl text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]">trophy</span>
                                </div>
                                <div className="absolute bottom-4 left-0 right-0 text-center uppercase tracking-widest font-black text-primary/40">Champion</div>
                            </div>
                        </div>

                        {/* 3rd Place */}
                        <div className="flex flex-col items-center w-full md:w-60 order-3 md:order-3">
                            <div className="mb-4 text-orange-400 flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-4xl">emoji_events</span>
                                <p className="text-sm font-mono bg-white/5 px-3 py-1 rounded-full border border-white/10 text-slate-300">{formatAddress(topWinners[2]?.address)}</p>
                                <p className="text-2xl font-bold text-orange-400">{calculateGain(topWinners[2]?.balance)}</p>
                            </div>
                            <div className="w-full h-28 bg-white/5 border-t border-x border-white/20 rounded-t-xl relative overflow-hidden flex flex-col items-center justify-center">
                                <div className="absolute inset-0 podium-gradient opacity-20"></div>
                                <span className="text-5xl font-black text-white/10">3</span>
                                <div className="absolute -top-10">
                                    <span className="material-symbols-outlined text-4xl text-orange-600/80 drop-shadow-[0_0_10px_rgba(234,88,12,0.5)]">workspace_premium</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* User Stats Card - Only show when connected */}
                    {wallet ? (
                        <div className="w-full max-w-4xl glass-card rounded-2xl p-8 mb-12 flex flex-col md:flex-row items-center justify-between gap-8 border-primary/20">
                            <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/30">
                                    <span className="text-3xl font-black text-primary">
                                        {userStats.rank ? `#${userStats.rank}` : '---'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-slate-400 uppercase text-xs font-bold tracking-widest">Your Performance</p>
                                    <h3 className="text-2xl font-bold">
                                        {userStats.isTop3
                                            ? `🎉 Top ${userStats.rank} Winner!`
                                            : userStats.rank
                                                ? 'Active Trader'
                                                : 'Not Ranked'}
                                    </h3>
                                </div>
                            </div>

                            <div className="flex gap-12 text-center">
                                <div>
                                    <p className="text-slate-400 text-sm mb-1">Current Balance</p>
                                    <p className="text-2xl font-bold text-primary">
                                        ${userStats.balance.toFixed(2)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-sm mb-1">Total PnL</p>
                                    <p className={`text-2xl font-bold ${userStats.realizedPnl >= 0 ? 'text-primary' : 'text-red-500'}`}>
                                        {userStats.realizedPnl >= 0 ? '+' : ''}{userStats.realizedPnl.toFixed(2)}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-sm mb-1">Status</p>
                                    <p className="text-2xl font-bold">
                                        {userStats.isTop3 ? '🏆' : userStats.rank ? '📊' : '---'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => userStats.rank && alert(`Rank: #${userStats.rank}\nBalance: $${userStats.balance.toFixed(2)}\nPnL: ${userStats.realizedPnl.toFixed(2)}%`)}
                                className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl font-bold transition-all border border-white/10"
                            >
                                View Stats
                            </button>
                        </div>
                    ) : (
                        <div className="w-full max-w-4xl glass-card rounded-2xl p-8 mb-12 flex flex-col items-center justify-center gap-4 border-primary/20">
                            <span className="material-symbols-outlined text-4xl text-primary">account_balance_wallet</span>
                            <p className="text-slate-400">Connect your wallet to see your tournament stats</p>
                            <button
                                onClick={() => document.querySelector('.wallet-adapter-button')?.click()}
                                className="bg-primary hover:bg-primary/90 text-background-dark px-6 py-2 rounded-lg font-bold transition-all"
                            >
                                Connect Wallet
                            </button>
                        </div>
                    )}

                    {/* Status Banner */}
                    <div className="w-full max-w-4xl @container mb-16">
                        <div className={`flex flex-col @[600px]:flex-row items-center justify-between gap-4 p-6 rounded-2xl border shadow-[0_0_30px_rgba(6,249,6,0.05)] ${userStats.isTop3
                            ? 'bg-yellow-500/10 border-yellow-500/30'
                            : 'bg-primary/5 border-primary/30'
                            }`}>
                            <div className="flex items-center gap-4 text-center @[600px]:text-left">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(6,249,6,0.6)] ${userStats.isTop3
                                    ? 'bg-yellow-500 text-background-dark'
                                    : 'bg-primary text-background-dark'
                                    }`}>
                                    <span className="material-symbols-outlined font-bold">
                                        {userStats.isTop3 ? 'emoji_events' : (wallet ? 'sports_esports' : 'account_circle')}
                                    </span>
                                </div>
                                <div>
                                    <p className={`text-lg font-bold ${userStats.isTop3 ? 'text-yellow-500' : 'text-primary'}`}>
                                        {userStats.isTop3
                                            ? `🏆 Congratulations! You ranked #${userStats.rank}!`
                                            : wallet
                                                ? 'Trading in Progress'
                                                : 'Connect Your Wallet'}
                                    </p>
                                    <p className="text-slate-400 text-sm">
                                        {userStats.isTop3
                                            ? 'You are among the top 3 winners of this round!'
                                            : wallet
                                                ? `Current Balance: $${userStats.balance.toFixed(2)} | PnL: ${userStats.realizedPnl >= 0 ? '+' : ''}${userStats.realizedPnl.toFixed(2)}%`
                                                : 'Connect your wallet to see your tournament stats'}
                                    </p>
                                </div>
                            </div>
                            {wallet && (
                                <button
                                    onClick={() => navigate('/dashboard')}
                                    className="flex items-center gap-2 text-primary font-bold hover:underline"
                                >
                                    Back to Trading
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Next Round Timer */}
                    <div className="mt-auto py-10 w-full flex flex-col items-center">
                        <p className="text-slate-500 uppercase tracking-[0.3em] text-xs font-black mb-4">
                            {roundInfo.isActive ? 'Round In Progress' : 'Next Round'}
                        </p>
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-2 text-4xl md:text-5xl font-black text-accent-purple drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                                <span className="material-symbols-outlined text-4xl md:text-5xl">timer</span>
                                <span className="tabular-nums">
                                    {roundInfo.isActive ? roundInfo.timeRemaining : 'WAITING FOR NEXT ROUND'}
                                </span>
                            </div>
                            <div className="w-64 h-1 bg-white/10 rounded-full mt-4 overflow-hidden">
                                <div
                                    className="h-full bg-accent-purple shadow-[0_0_10px_rgba(168,85,247,1)] transition-all duration-1000"
                                    style={{
                                        width: roundInfo.endTime && roundInfo.isActive
                                            ? `${Math.max(0, Math.min(100, ((roundInfo.endTime - Math.floor(Date.now() / 1000)) / 3600) * 100))}%`
                                            : '0%'
                                    }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Sidebar / Footer shortcut */}
                <footer className="px-6 py-8 border-t border-white/5 bg-black/40 text-center">
                    <p className="text-slate-600 text-sm font-medium">© 2024 Solana Arena. Built for the fastest traders in the galaxy.</p>
                </footer>
            </div>
        </div>
    );
}
