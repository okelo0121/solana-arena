import React, { useState, useEffect, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useNavigate } from 'react-router-dom';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { useSolanaArena } from '../hooks/useSolanaArena';
import { PublicKey } from '@solana/web3.js';
import RoundTimer from '../components/RoundTimer';

export default function LandingPage() {
    const navigate = useNavigate();
    const wallet = useAnchorWallet();
    const { program } = useSolanaArena();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const [topWinners, setTopWinners] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchLeaderboard = useCallback(async () => {
        if (!program) {
            setIsLoading(false);
            return;
        }
        try {
            const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
            const roundData = await program.account.arenaRound.fetch(arenaRoundPda);

            const winners = [];
            for (let i = 0; i < 3; i++) {
                const player = roundData.topPlayers[i];
                const balance = roundData.topBalances[i];
                if (player && !player.equals(PublicKey.default)) {
                    const initialBalance = 10000;
                    const currentBalance = balance / 1_000_000;
                    const pnl = currentBalance - initialBalance;
                    winners.push({
                        rank: i + 1,
                        address: player.toString(),
                        name: `Trader ${player.toString().slice(0, 4)}`,
                        pnl: pnl,
                        displayAddress: `${player.toString().slice(0, 6)}...${player.toString().slice(-4)}`
                    });
                }
            }
            setTopWinners(winners);
        } catch (e) {
            console.error("Failed to fetch leaderboard:", e);
        } finally {
            setIsLoading(false);
        }
    }, [program]);

    useEffect(() => {
        fetchLeaderboard();
        // Refresh every 30 seconds
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    const formatPnl = (pnl) => {
        const sign = pnl >= 0 ? '+' : '';
        return `${sign}$${pnl.toFixed(2)}`;
    };

    return (
        <>
            {/* TopNavBar */}
            <header className="sticky top-0 z-50 glass-panel border-b border-border-dark px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
                <h1 className="text-lg md:text-xl font-bold tracking-tight">Solana Arena</h1>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <span className="text-sm font-medium text-primary border-b-2 border-primary pb-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">home</span>
                        Home
                    </span>
                    {wallet && (
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">dashboard</span>
                            Dashboard
                        </button>
                    )}
                    <a className="text-sm font-medium hover:text-primary transition-colors" href="#leaderboard">Leaderboard</a>
                    <a className="text-sm font-medium hover:text-primary transition-colors" href="#how-it-works">How It Works</a>
                    <a className="text-sm font-medium hover:text-primary transition-colors" href="#trophies">Trophies</a>
                </nav>

                <div className="flex items-center gap-2 md:gap-4">
                    <RoundTimer />
                    <div className="hidden md:block">
                        <WalletMultiButton className="!bg-primary !text-background-dark !px-6 !py-2 !rounded-lg !font-bold !text-sm hover:!bg-primary/90 !transition-colors !shadow-[0_0_15px_rgba(6,249,6,0.3)]" />
                    </div>
                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 text-slate-300 hover:text-primary transition-colors"
                    >
                        <span className="material-symbols-outlined text-2xl">
                            {mobileMenuOpen ? 'close' : 'menu'}
                        </span>
                    </button>
                </div>
            </header>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-x-0 top-[60px] z-40 glass-panel border-b border-border-dark p-4 flex flex-col gap-4">
                    <span className="text-sm font-medium text-primary flex items-center gap-2 py-2">
                        <span className="material-symbols-outlined text-sm">home</span>
                        Home
                    </span>
                    {wallet && (
                        <button
                            onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }}
                            className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-2 py-2">
                            <span className="material-symbols-outlined text-sm">dashboard</span>
                            Dashboard
                        </button>
                    )}
                    <a
                        className="text-sm font-medium hover:text-primary transition-colors py-2 flex items-center gap-2"
                        href="#leaderboard"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span className="material-symbols-outlined text-sm">leaderboard</span>
                        Leaderboard
                    </a>
                    <a
                        className="text-sm font-medium hover:text-primary transition-colors py-2 flex items-center gap-2"
                        href="#how-it-works"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span className="material-symbols-outlined text-sm">help</span>
                        How It Works
                    </a>
                    <a
                        className="text-sm font-medium hover:text-primary transition-colors py-2 flex items-center gap-2"
                        href="#trophies"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span className="material-symbols-outlined text-sm">emoji_events</span>
                        Trophies
                    </a>
                    <div className="pt-2 border-t border-border-dark">
                        <WalletMultiButton className="!bg-primary !text-background-dark !px-6 !py-2 !rounded-lg !font-bold !text-sm hover:!bg-primary/90 !transition-colors !shadow-[0_0_15px_rgba(6,249,6,0.3)] w-full" />
                    </div>
                </div>
            )}

            <main className="flex-1 flex flex-col relative">
                {/* Hero Section */}
                <section className="relative min-h-[80vh] flex flex-col items-center justify-center p-6 text-center overflow-hidden bg-grid">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-dark/80 to-background-dark pointer-events-none"></div>
                    <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center gap-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-primary/30 text-primary text-sm font-medium mb-4">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Season 1 Live
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter">
                            Trade. Compete. <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-400">Dominate.</span>
                        </h1>
                        <p className="text-lg md:text-xl text-text-muted max-w-2xl font-light">
                            Real-time onchain trading arena powered by Ephemeral Rollups. Outsmart the competition and claim your rewards.
                        </p>
                        <button onClick={() => navigate('/dashboard')} className="mt-4 px-8 py-4 bg-primary text-background-dark rounded-xl font-bold text-lg hover:bg-primary/90 transition-all glow-effect flex items-center gap-2 group">
                            Enter Arena
                            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </button>
                    </div>
                    {/* Abstract Background Elements */}
                    <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                </section>

                <div className="max-w-[1200px] w-full mx-auto px-6 py-16 flex flex-col gap-24">
                    {/* Leaderboard Preview */}
                    <section className="flex flex-col gap-8" id="leaderboard">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-bold tracking-tight mb-2">Top Gladiators</h2>
                                <p className="text-text-muted">
                                    {program ? 'Live rankings from Solana blockchain' : 'Connect wallet to view live rankings'}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/tournament')}
                                className="text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                            >
                                View Full Rankings <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        </div>
                        <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse whitespace-nowrap">
                                    <thead>
                                        <tr className="bg-surface-dark/80 border-b border-border-dark text-text-muted text-sm font-semibold">
                                            <th className="px-6 py-4">Rank</th>
                                            <th className="px-6 py-4">Gladiator</th>
                                            <th className="px-6 py-4">Wallet</th>
                                            <th className="px-6 py-4 text-right">PnL (24h)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark/50 font-medium">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-8 text-center text-text-muted">
                                                    <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                                                    Loading leaderboard...
                                                </td>
                                            </tr>
                                        ) : topWinners.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-8 text-center text-text-muted">
                                                    <span className="material-symbols-outlined text-4xl mb-2">sports_esports</span>
                                                    <p>No winners yet. Be the first to trade!</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            topWinners.map((winner, index) => (
                                                <tr key={winner.address} className="hover:bg-surface-dark/50 transition-colors">
                                                    <td className="px-6 py-4 flex items-center gap-2">
                                                        <span className={`material-symbols-outlined text-xl ${index === 0 ? 'text-yellow-400' :
                                                            index === 1 ? 'text-slate-300' :
                                                                'text-amber-600'
                                                            }`}>workspace_premium</span>
                                                        {winner.rank}
                                                    </td>
                                                    <td className="px-6 py-4 font-bold">{winner.name}</td>
                                                    <td className="px-6 py-4 text-text-muted font-mono text-sm">{winner.displayAddress}</td>
                                                    <td className={`px-6 py-4 text-right ${winner.pnl >= 0 ? 'text-primary' : 'text-red-500'}`}>
                                                        {formatPnl(winner.pnl)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    {/* How It Works */}
                    <section className="flex flex-col gap-10" id="how-it-works">
                        <div className="text-center max-w-2xl mx-auto">
                            <h2 className="text-3xl font-bold tracking-tight mb-4">Enter The Arena</h2>
                            <p className="text-text-muted">Three steps to glory.</p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="glass-panel rounded-2xl p-8 flex flex-col gap-4 relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl group-hover:bg-purple-500/30 transition-colors"></div>
                                <div className="w-12 h-12 rounded-xl bg-surface-dark border border-border-dark flex items-center justify-center text-purple-400 mb-2">
                                    <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                                </div>
                                <h3 className="text-xl font-bold">1. Connect Wallet</h3>
                                <p className="text-text-muted text-sm leading-relaxed">Securely link your Solana wallet to access the platform. No funds are locked.</p>
                            </div>
                            <div className="glass-panel rounded-2xl p-8 flex flex-col gap-4 relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl group-hover:bg-purple-500/30 transition-colors"></div>
                                <div className="w-12 h-12 rounded-xl bg-surface-dark border border-border-dark flex items-center justify-center text-purple-400 mb-2">
                                    <span className="material-symbols-outlined text-2xl">meeting_room</span>
                                </div>
                                <h3 className="text-xl font-bold">2. Join a Room</h3>
                                <p className="text-text-muted text-sm leading-relaxed">Select a combat room matching your risk profile and trading style.</p>
                            </div>
                            <div className="glass-panel rounded-2xl p-8 flex flex-col gap-4 relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl group-hover:bg-purple-500/30 transition-colors"></div>
                                <div className="w-12 h-12 rounded-xl bg-surface-dark border border-border-dark flex items-center justify-center text-purple-400 mb-2">
                                    <span className="material-symbols-outlined text-2xl">monitoring</span>
                                </div>
                                <h3 className="text-xl font-bold">3. Trade &amp; Dominate</h3>
                                <p className="text-text-muted text-sm leading-relaxed">Execute trades instantly, climb the leaderboard, and earn exclusive rewards.</p>
                            </div>
                        </div>
                    </section>

                    {/* Why It Matters */}
                    <section className="grid md:grid-cols-3 gap-6 border-t border-border-dark pt-16">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-primary/10 text-primary">
                                <span className="material-symbols-outlined">bolt</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-lg mb-1">Gasless Trading</h4>
                                <p className="text-sm text-text-muted">Zero friction. Focus on strategy, not fees.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-primary/10 text-primary">
                                <span className="material-symbols-outlined">speed</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-lg mb-1">Real-Time Settlement</h4>
                                <p className="text-sm text-text-muted">Instant execution powered by Ephemeral Rollups.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-primary/10 text-primary">
                                <span className="material-symbols-outlined">shield_lock</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-lg mb-1">Private Strategies</h4>
                                <p className="text-sm text-text-muted">Your alpha remains yours until execution.</p>
                            </div>
                        </div>
                    </section>

                    {/* Trophies */}
                    <section className="flex flex-col gap-8 pb-16" id="trophies">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold tracking-tight mb-2">Digital Spoils</h2>
                            <p className="text-text-muted">Exclusive NFT trophies for top gladiators.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="glass-panel rounded-xl aspect-square flex flex-col items-center justify-center p-4 relative overflow-hidden group border-amber-500/30">
                                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent"></div>
                                <span className="material-symbols-outlined text-6xl text-amber-400 mb-2 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">emoji_events</span>
                                <span className="font-bold text-sm">Grand Champion</span>
                            </div>
                            <div className="glass-panel rounded-xl aspect-square flex flex-col items-center justify-center p-4 relative overflow-hidden group border-slate-300/30">
                                <div className="absolute inset-0 bg-gradient-to-b from-slate-300/10 to-transparent"></div>
                                <span className="material-symbols-outlined text-6xl text-slate-300 mb-2 drop-shadow-[0_0_10px_rgba(203,213,225,0.5)]">military_tech</span>
                                <span className="font-bold text-sm">Season Elite</span>
                            </div>
                            <div className="glass-panel rounded-xl aspect-square flex flex-col items-center justify-center p-4 relative overflow-hidden group border-amber-700/30">
                                <div className="absolute inset-0 bg-gradient-to-b from-amber-700/10 to-transparent"></div>
                                <span className="material-symbols-outlined text-6xl text-amber-600 mb-2 drop-shadow-[0_0_10px_rgba(217,119,6,0.5)]">local_fire_department</span>
                                <span className="font-bold text-sm">Top Trader</span>
                            </div>
                            <div className="glass-panel rounded-xl aspect-square flex flex-col items-center justify-center p-4 relative overflow-hidden group border-purple-500/30">
                                <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent"></div>
                                <span className="material-symbols-outlined text-6xl text-purple-400 mb-2 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">diamond</span>
                                <span className="font-bold text-sm">Whale Hunter</span>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-border-dark bg-surface-dark py-12 px-6">
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="text-primary material-symbols-outlined">swords</div>
                        <span className="font-bold text-lg">Solana Arena</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <a className="text-text-muted hover:text-primary transition-colors flex items-center gap-1" href="#">
                            <span className="material-symbols-outlined text-sm">forum</span> Discord
                        </a>
                        <a className="text-text-muted hover:text-primary transition-colors flex items-center gap-1" href="#">
                            <span className="material-symbols-outlined text-sm">tag</span> Twitter
                        </a>
                    </div>
                    <button className="px-6 py-2 border border-primary text-primary rounded-lg font-bold text-sm hover:bg-primary/10 transition-colors">
                        Enter Arena
                    </button>
                </div>
                <div className="max-w-[1200px] mx-auto mt-8 text-center text-xs text-text-muted/50">
                    © 2024 Solana Arena. All rights reserved. Not financial advice.
                </div>
            </footer>
        </>
    );
}
