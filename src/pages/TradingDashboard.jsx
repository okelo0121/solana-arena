import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolanaArena } from '../hooks/useSolanaArena';
import { SystemProgram, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { getHistoricalCandles, subscribeLiveCandles } from '../services/marketData';
import { useNavigate } from 'react-router-dom';

// PYTH Receiver Program ID and Feed ID
const SOL_USD_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

export default function TradingDashboard() {
    const { program, wallet } = useSolanaArena();
    const navigate = useNavigate();

    const [amount, setAmount] = useState(10);
    const [leverage, setLeverage] = useState(10);
    const [side, setSide] = useState(1); // 1 = Long, 2 = Short (for new trade selection)
    const [isInitialized, setIsInitialized] = useState(false);
    const [virtualBalance, setVirtualBalance] = useState(0.0);
    const [timeframe, setTimeframe] = useState('1m');
    const [candles, setCandles] = useState([]);
    const [livePrice, setLivePrice] = useState(null);
    const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 });
    const [marketStats, setMarketStats] = useState({ high: 0, low: 0, volume: 0 });

    // User position data from smart contract
    const [userPosition, setUserPosition] = useState({
        positionSide: 0, // 0 = none, 1 = long, 2 = short
        positionSize: 0,
        entryPrice: 0,
        leverage: 1,
        unrealizedPnl: 0,
        liquidationPrice: 0
    });

    // Round timer state
    const [roundInfo, setRoundInfo] = useState({
        endTime: null,
        timeRemaining: '00:00:00',
        isActive: false
    });

    // Chat state
    const [chatMessages, setChatMessages] = useState([
        { id: 1, user: 'WhaleWatcher', text: 'SOL is testing resistance 🚀', type: 'user', color: 'accent-purple' },
        { id: 2, user: 'DegenKing', text: 'Just entered top 10 LFG!', type: 'user', color: 'primary' },
        { id: 3, user: 'ArenaBot', text: 'New round started! Good luck traders!', type: 'bot', color: 'slate-500' }
    ]);
    const [chatInput, setChatInput] = useState('');

    // Leaderboard state (mock for now since contract doesn't store full leaderboard)
    const [leaderboard, setLeaderboard] = useState([
        { rank: 1, address: '8YxQ...2p9M', winRate: 84, pnl: 1240.2, streak: 12, isUser: false },
        { rank: 2, address: '2m3s...K8Lz', winRate: 76, pnl: 845.1, streak: 8, isUser: false },
        { rank: 3, address: '9p1a...VbQ0', winRate: 62, pnl: 412.8, streak: 5, isUser: false }
    ]);

    // Trade feed state
    const [tradeFeed, setTradeFeed] = useState([
        { id: 1, side: 'LONG', size: 120.4, time: new Date().toLocaleTimeString('en-US', { hour12: false }) },
        { id: 2, side: 'SHORT', size: 45.2, time: new Date(Date.now() - 3000).toLocaleTimeString('en-US', { hour12: false }) },
        { id: 3, side: 'LONG', size: 5.0, time: new Date(Date.now() - 6000).toLocaleTimeString('en-US', { hour12: false }) }
    ]);

    // Active tab state for sidebar
    const [activeTab, setActiveTab] = useState('trading'); // 'trading', 'wallet', 'tournament'

    // Username state (from localStorage)
    const [username, setUsername] = useState('');
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [tempUsername, setTempUsername] = useState('');

    // User rank state
    const [userRank, setUserRank] = useState({
        rank: 42,
        winRate: 58,
        pnl: 125.5,
        streak: 3,
        behindLeader: 1114.7
    });

    const initRef = useRef(false);
    const chatEndRef = useRef(null);

    // Load username from localStorage on mount
    useEffect(() => {
        const savedUsername = localStorage.getItem('solanaArena_username');
        if (savedUsername) {
            setUsername(savedUsername);
        }
    }, []);

    // Save username to localStorage
    const saveUsername = () => {
        if (tempUsername.trim()) {
            localStorage.setItem('solanaArena_username', tempUsername.trim());
            setUsername(tempUsername.trim());
            setShowSettingsModal(false);
        }
    };

    // Get display name for user
    const getUserDisplayName = () => {
        return username || (wallet?.publicKey?.toString().slice(0, 4) + '...' + wallet?.publicKey?.toString().slice(-4)) || 'You';
    };

    // Format time remaining
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

    // Fetch live session and position data
    const syncSession = useCallback(async () => {
        if (!program || !wallet) return;
        const [playerSessionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("session"), wallet.publicKey.toBuffer()],
            program.programId
        );
        try {
            const sessionData = await program.account.playerSession.fetch(playerSessionPda);
            setVirtualBalance(sessionData.virtualBalance.toNumber() / 1000000); // 6 decimals

            // Update user position
            const posSide = sessionData.positionSide;
            const posSize = sessionData.positionSizeUsd.toNumber() / 1000000;
            const entryPrice = sessionData.entryPrice.toNumber() / 100000000; // Pyth price has 8 decimals
            const lev = sessionData.leverage;

            // Calculate unrealized PnL if position exists
            let unrealizedPnl = 0;
            let liqPrice = 0;
            if (posSide !== 0 && livePrice) {
                const priceDiff = livePrice - entryPrice;
                const percentChange = priceDiff / entryPrice;
                if (posSide === 1) { // Long
                    unrealizedPnl = posSize * percentChange * lev;
                    liqPrice = entryPrice * (1 - 0.9 / lev); // 90% margin liquidation
                } else { // Short
                    unrealizedPnl = posSize * -percentChange * lev;
                    liqPrice = entryPrice * (1 + 0.9 / lev);
                }
            }

            setUserPosition({
                positionSide: posSide,
                positionSize: posSize,
                entryPrice: entryPrice,
                leverage: lev,
                unrealizedPnl: unrealizedPnl,
                liquidationPrice: liqPrice
            });
        } catch (e) {
            console.log("Session not found yet.");
        }
    }, [program, wallet, livePrice]);

    // Fetch round info
    const syncRoundInfo = useCallback(async () => {
        if (!program) return;
        const [arenaRoundPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("arena")],
            program.programId
        );
        try {
            const roundData = await program.account.arenaRound.fetch(arenaRoundPda);
            setRoundInfo({
                endTime: roundData.endTime.toNumber(),
                timeRemaining: formatTimeRemaining(roundData.endTime.toNumber()),
                isActive: roundData.isActive
            });
        } catch (e) {
            console.log("Round not found.");
        }
    }, [program]);

    // Fetch round info when program is available (even without wallet)
    useEffect(() => {
        if (program) {
            syncRoundInfo();
        }
    }, [program, syncRoundInfo]);

    // Round timer countdown
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

    // Auto-refresh user position when price changes
    useEffect(() => {
        if (userPosition.positionSide !== 0) {
            syncSession();
        }
    }, [livePrice, userPosition.positionSide, syncSession]);

    // Binance Market Data Hook
    useEffect(() => {
        let ws;
        let isMounted = true;

        const loadData = async () => {
            try {
                const history = await getHistoricalCandles('SOLUSDT', timeframe, 40);
                if (!isMounted) return;

                setCandles(history);

                if (history.length > 0) {
                    setMarketStats({
                        high: Math.max(...history.map(c => c.high)),
                        low: Math.min(...history.map(c => c.low)),
                        volume: history.length * 1000
                    });

                    const latestClose = history[history.length - 1].close;
                    setLivePrice(latestClose);

                    const firstPrice = history[0].open;
                    const changeValue = latestClose - firstPrice;
                    const changePercent = (changeValue / firstPrice) * 100;
                    setPriceChange({
                        value: changeValue,
                        percent: changePercent
                    });
                }

                ws = subscribeLiveCandles('SOLUSDT', timeframe, (newCandle) => {
                    if (!isMounted) return;
                    setLivePrice(newCandle.close);
                    setCandles(prev => {
                        if (prev.length === 0) return [newCandle];
                        const last = prev[prev.length - 1];
                        if (newCandle.time === last.time) {
                            const updated = [...prev];
                            updated[updated.length - 1] = newCandle;
                            return updated;
                        } else if (newCandle.time > last.time) {
                            return [...prev.slice(1), newCandle];
                        }
                        return prev;
                    });
                });
            } catch (err) {
                console.error("Failed to fetch market data:", err);
            }
        };

        loadData();
        return () => {
            isMounted = false;
            if (ws) { ws.close(); ws = null; }
        };
    }, [timeframe]);

    // Auto-initialize round and session
    useEffect(() => {
        if (wallet && program && !isInitialized && !initRef.current) {
            initRef.current = true;
            const initOrLoadRound = async () => {
                try {
                    const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
                    const [playerSessionPda] = PublicKey.findProgramAddressSync([Buffer.from("session"), wallet.publicKey.toBuffer()], program.programId);

                    try {
                        await program.account.arenaRound.fetch(arenaRoundPda);
                    } catch (e) {
                        await program.methods.initializeRound()
                            .accounts({ arenaRound: arenaRoundPda, admin: wallet.publicKey, systemProgram: SystemProgram.programId })
                            .rpc();
                    }

                    try {
                        await program.account.playerSession.fetch(playerSessionPda);
                    } catch (e) {
                        await program.methods.joinArena()
                            .accounts({ playerSession: playerSessionPda, player: wallet.publicKey, systemProgram: SystemProgram.programId })
                            .rpc();
                    }

                    setIsInitialized(true);
                    await syncSession();
                    await syncRoundInfo();
                } catch (e) {
                    console.error("Initialization error:", e);
                    initRef.current = false;
                }
            };
            initOrLoadRound();
        }
    }, [wallet, program, isInitialized, syncSession, syncRoundInfo]);

    // Simulate live trade feed
    useEffect(() => {
        const interval = setInterval(() => {
            const sides = ['LONG', 'SHORT'];
            const randomSide = sides[Math.floor(Math.random() * sides.length)];
            const randomSize = (Math.random() * 100 + 1).toFixed(1);
            const newTrade = {
                id: Date.now(),
                side: randomSide,
                size: parseFloat(randomSize),
                time: new Date().toLocaleTimeString('en-US', { hour12: false })
            };
            setTradeFeed(prev => [newTrade, ...prev].slice(0, 10));
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Scroll to bottom of chat
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages]);

    const executeTrade = async () => {
        if (!wallet || !program || !isInitialized) return;
        try {
            const [arenaRoundPda] = PublicKey.findProgramAddressSync([Buffer.from("arena")], program.programId);
            const [playerSessionPda] = PublicKey.findProgramAddressSync([Buffer.from("session"), wallet.publicKey.toBuffer()], program.programId);

            const pythSolanaReceiver = new PythSolanaReceiver({
                connection: program.provider.connection,
                wallet: wallet
            });

            const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
            const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}`);
            const data = await response.json();
            const vaaBuffer = Buffer.from(data.binary.data[0], "hex");

            await transactionBuilder.addPostPriceUpdates([vaaBuffer.toString("base64")]);

            await transactionBuilder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => {
                const priceUpdateAccount = getPriceUpdateAccount("0x" + SOL_USD_FEED_ID);
                const ix = await program.methods.executeTrade(side, new anchor.BN(amount * 1000000), leverage)
                    .accounts({
                        arenaRound: arenaRoundPda,
                        playerSession: playerSessionPda,
                        player: wallet.publicKey,
                        pythOracle: priceUpdateAccount,
                    })
                    .instruction();
                return [{ instruction: ix, signers: [] }];
            });

            const txns = await pythSolanaReceiver.provider.sendAll(
                await transactionBuilder.buildVersionedTransactions({ computeUnitPriceMicroLamports: 50000 })
            );

            console.log("Trade Executed! Signatures:", txns);
            await syncSession();

            // Add to trade feed
            const newTrade = {
                id: Date.now(),
                side: side === 1 ? 'LONG' : 'SHORT',
                size: amount,
                time: new Date().toLocaleTimeString('en-US', { hour12: false })
            };
            setTradeFeed(prev => [newTrade, ...prev].slice(0, 10));

        } catch (error) {
            console.error("Trade execution failed:", error);
        }
    };

    const sendChatMessage = () => {
        if (!chatInput.trim()) return;
        const newMessage = {
            id: Date.now(),
            user: wallet?.publicKey?.toString().slice(0, 4) + '...' + wallet?.publicKey?.toString().slice(-4) || 'You',
            text: chatInput,
            type: 'user',
            color: 'primary'
        };
        setChatMessages(prev => [...prev, newMessage]);
        setChatInput('');
    };

    const handleChatKeyPress = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };

    // Get button style based on user's actual position
    const getLongButtonStyle = () => {
        const isSelected = side === 1;
        const hasLongPosition = userPosition.positionSide === 1;
        if (hasLongPosition) {
            return 'bg-primary text-background-dark shadow-[0_0_25px_rgba(6,249,6,0.5)] ring-2 ring-primary';
        }
        return isSelected
            ? 'bg-primary text-background-dark shadow-[0_0_25px_rgba(6,249,6,0.5)]'
            : 'bg-primary/20 text-primary border border-primary/30';
    };

    const getShortButtonStyle = () => {
        const isSelected = side === 2;
        const hasShortPosition = userPosition.positionSide === 2;
        if (hasShortPosition) {
            return 'bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.5)] ring-2 ring-red-500';
        }
        return isSelected
            ? 'bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.5)]'
            : 'bg-red-500/20 text-red-500 border border-red-500/30';
    };

    return (
        <div className="bg-background-dark font-display text-slate-100 min-h-screen flex flex-col selection:bg-primary selection:text-black">
            <header className="h-14 md:h-16 border-b border-primary/30 bg-background-dark/90 backdrop-blur-xl sticky top-0 z-50 px-3 md:px-6 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                <button onClick={() => navigate('/')} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
                    <h1 className="text-lg md:text-2xl font-black tracking-tighter uppercase italic">Solana <span className="text-primary drop-shadow-[0_0_8px_rgba(6,249,6,0.6)]">Arena</span></h1>
                </button>
                <div className="flex items-center gap-2 md:gap-6">
                    <div className="flex flex-col items-center">
                        <span className="hidden sm:block text-[10px] uppercase tracking-[0.2em] text-accent-purple font-bold">
                            {roundInfo.isActive ? 'Round Timer' : 'Round Ended'}
                        </span>
                        <div className="digital-font text-xl md:text-3xl font-bold text-accent-purple leading-none tracking-tighter">
                            {roundInfo.timeRemaining}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    {wallet && (
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Available Funds</span>
                            <span className="text-primary font-bold text-lg md:text-xl leading-none tracking-tight drop-shadow-[0_0_5px_rgba(6,249,6,0.4)]">
                                ${virtualBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                    <WalletMultiButton className="!bg-black/40 !backdrop-blur-md !border-2 !border-primary/50 !rounded-xl !h-9 md:!h-10 hover:!border-primary !transition-colors !shadow-[0_0_15px_rgba(6,249,6,0.3)]" />
                </div>
            </header>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Desktop Sidebar */}
                <nav className="hidden md:flex w-20 border-r border-primary/20 flex-col items-center py-8 gap-10 bg-black/40 backdrop-blur-md">
                    <button onClick={() => setActiveTab('trading')}
                        className={`p-3 rounded-2xl transition-all ${activeTab === 'trading' ? 'text-primary bg-primary/10 shadow-[0_0_15px_rgba(6,249,6,0.2)]' : 'text-slate-500 hover:text-primary hover:bg-primary/5'}`}
                        title="Trading">
                        <span className="material-symbols-outlined text-3xl">query_stats</span>
                    </button>
                    <button onClick={() => alert(`Wallet: ${wallet?.publicKey?.toString() || 'Not connected'}\nBalance: $${virtualBalance.toFixed(2)}`)}
                        className={`p-3 rounded-2xl transition-all ${activeTab === 'wallet' ? 'text-primary bg-primary/10 shadow-[0_0_15px_rgba(6,249,6,0.2)]' : 'text-slate-500 hover:text-primary hover:bg-primary/5'}`}
                        title="Wallet Info">
                        <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                    </button>
                    <button onClick={() => navigate('/tournament')}
                        className={`p-3 rounded-2xl transition-all ${activeTab === 'tournament' ? 'text-primary bg-primary/10 shadow-[0_0_15px_rgba(6,249,6,0.2)]' : 'text-slate-500 hover:text-primary hover:bg-primary/5'}`}
                        title="Tournament Results">
                        <span className="material-symbols-outlined text-3xl">trophy</span>
                    </button>
                    <button onClick={() => navigate('/')}
                        className="text-slate-500 hover:text-primary hover:bg-primary/5 p-3 rounded-2xl transition-all mt-auto"
                        title="Back to Home">
                        <span className="material-symbols-outlined text-3xl">arrow_back</span>
                    </button>
                    <button onClick={() => { setTempUsername(username); setShowSettingsModal(true); }}
                        className="text-slate-500 hover:text-primary hover:bg-primary/5 p-3 rounded-2xl transition-all"
                        title="Settings">
                        <span className="material-symbols-outlined text-3xl">settings</span>
                    </button>
                </nav>

                <div className="flex-1 flex flex-col pb-16 md:pb-0 overflow-y-auto">
                    <div className="flex-1 flex flex-col lg:flex-row">
                        <div className="flex-1 flex flex-col p-2 md:p-4 gap-2 md:gap-4 min-h-0">
                            {/* Price Header - Mobile Optimized */}
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between glass p-3 md:p-5 rounded-2xl gap-3 md:gap-0">
                                <div className="flex items-center gap-4 md:gap-8 w-full md:w-auto">
                                    <div>
                                        <h2 className="text-lg md:text-xl font-bold tracking-tight">SOL/USDT</h2>
                                        <div className="flex items-center gap-2">
                                            <p className="text-primary text-base md:text-lg font-bold drop-shadow-[0_0_5px_rgba(6,249,6,0.4)]">
                                                ${livePrice ? livePrice.toFixed(2) : '---'}
                                            </p>
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-black ${priceChange.percent >= 0 ? 'bg-primary/20 text-primary' : 'bg-red-500/20 text-red-500'}`}>
                                                {priceChange.percent >= 0 ? '+' : ''}{priceChange.percent.toFixed(1)}%
                                            </span>
                                            <div className="hidden md:flex items-end gap-0.5 ml-2 h-4">
                                                <div className="sound-bar w-1 bg-primary" style={{ animationDelay: '0.1s' }}></div>
                                                <div className="sound-bar w-1 bg-primary" style={{ animationDelay: '0.3s' }}></div>
                                                <div className="sound-bar w-1 bg-primary" style={{ animationDelay: '0.2s' }}></div>
                                                <div className="sound-bar w-1 bg-primary" style={{ animationDelay: '0.4s' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="hidden md:block h-10 w-px bg-slate-800"></div>
                                    <div className="hidden md:flex gap-6 text-[11px] font-mono">
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">24H High</span>
                                            <span className="text-slate-100 font-bold">{marketStats.high ? marketStats.high.toFixed(2) : '---'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">24H Low</span>
                                            <span className="text-slate-100 font-bold">{marketStats.low ? marketStats.low.toFixed(2) : '---'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">Vol 24H</span>
                                            <span className="text-slate-100 font-bold">{(marketStats.volume / 1000000).toFixed(1)}M SOL</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1 md:gap-2 w-full md:w-auto justify-between md:justify-end">
                                    {['1m', '5m', '1h', '1d'].map((tf) => (
                                        <button key={tf} onClick={() => setTimeframe(tf)}
                                            className={`flex-1 md:flex-none px-3 md:px-4 py-2 text-xs rounded-lg transition-colors ${timeframe === tf ? 'font-black bg-primary/20 text-primary border border-primary shadow-[0_0_15px_rgba(6,249,6,0.2)]' : 'font-bold bg-slate-900 border border-slate-700 hover:border-primary/50'}`}>
                                            {tf}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-[300px] md:flex-1 glass rounded-2xl candlestick-container relative overflow-hidden flex flex-col group">
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none"></div>
                                <div className="flex-1 flex items-end justify-around p-8 gap-2 relative z-10">
                                    {candles.length > 0 ? (
                                        (() => {
                                            const allPrices = candles.flatMap(c => [c.high, c.low]);
                                            const minPrice = Math.min(...allPrices);
                                            const maxPrice = Math.max(...allPrices);
                                            const priceRange = maxPrice - minPrice || 1;
                                            return candles.map((candle, index) => {
                                                const isGreen = candle.close >= candle.open;
                                                const colorClass = isGreen ? 'bg-primary' : 'bg-red-500';
                                                const shadowClass = isGreen ? 'shadow-[0_0_10px_rgba(6,249,6,0.2)]' : 'shadow-[0_0_10px_rgba(239,68,68,0.2)]';
                                                const wickColorClass = isGreen ? 'bg-primary/30' : 'bg-red-500/30';
                                                const highPercent = ((candle.high - minPrice) / priceRange) * 100;
                                                const lowPercent = ((candle.low - minPrice) / priceRange) * 100;
                                                const openPercent = ((candle.open - minPrice) / priceRange) * 100;
                                                const closePercent = ((candle.close - minPrice) / priceRange) * 100;
                                                const bodyTop = Math.max(openPercent, closePercent);
                                                const bodyBottom = Math.min(openPercent, closePercent);
                                                const bodyHeight = Math.max(bodyTop - bodyBottom, 2);
                                                const wickTop = highPercent;
                                                const wickBottom = lowPercent;
                                                const wickHeight = wickTop - wickBottom;
                                                const isLatest = index === candles.length - 1;
                                                return (
                                                    <div key={candle.time} className="relative flex flex-col items-center justify-end" style={{ height: '100%', width: '100%', maxWidth: '20px' }}>
                                                        <div className={`absolute left-1/2 -translate-x-1/2 w-0.5 ${wickColorClass} -z-10`} style={{ bottom: `${wickBottom}%`, height: `${wickHeight}%` }} />
                                                        <div className={`w-full ${colorClass}/90 rounded-sm ${shadowClass} ${isLatest ? 'ring-2 ring-primary/50 shadow-[0_0_25px_rgba(6,249,6,0.5)]' : ''}`} style={{ position: 'absolute', bottom: `${bodyBottom}%`, height: `${bodyHeight}%` }} />
                                                    </div>
                                                );
                                            });
                                        })()
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading market data...</div>
                                    )}
                                </div>
                                <div className="absolute bottom-4 right-6 text-[11px] text-primary/60 font-mono font-black tracking-widest bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                                    LIVE BINANCE FEED // {timeframe.toUpperCase()}
                                </div>
                            </div>
                        </div>

                        <aside className="w-full lg:w-80 lg:p-4 lg:border-l lg:border-primary/20 lg:bg-background-dark/80 flex flex-col gap-4 mt-2 lg:mt-0">
                            <div className="glass p-4 md:p-6 rounded-2xl flex flex-col gap-4 md:gap-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                                <div className="flex gap-3">
                                    <button onClick={() => setSide(1)}
                                        className={`flex-1 py-3 md:py-4 rounded-xl font-black uppercase tracking-[0.15em] transition-all hover:scale-[1.03] active:scale-[0.97] ${getLongButtonStyle()}`}>
                                        Long {userPosition.positionSide === 1 && '✓'}
                                    </button>
                                    <button onClick={() => setSide(2)}
                                        className={`flex-1 py-3 md:py-4 rounded-xl font-black uppercase tracking-[0.15em] transition-all hover:scale-[1.03] active:scale-[0.97] ${getShortButtonStyle()}`}>
                                        Short {userPosition.positionSide === 2 && '✓'}
                                    </button>
                                </div>
                                <div className="space-y-4 md:space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] ml-1">Position Size (SOL)</label>
                                        <div className="relative group">
                                            <input value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                                                className="w-full bg-black/60 border-2 border-slate-800 focus:border-primary focus:ring-0 rounded-xl px-4 py-3 md:py-4 font-mono text-lg md:text-xl transition-all group-hover:border-slate-700" type="number" />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-black text-xs cursor-pointer hover:underline">MAX</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] ml-1">Leverage Multiplier</label>
                                        <div className="flex justify-between gap-1.5 p-1.5 bg-black/40 rounded-xl">
                                            {[1, 5, 10, 20, 50].map(mult => (
                                                <button key={mult} onClick={() => setLeverage(mult)}
                                                    className={`text-[11px] py-2 rounded-lg flex-1 transition-colors ${leverage === mult ? 'bg-primary text-background-dark font-black shadow-[0_0_10px_rgba(6,249,6,0.3)]' : 'font-bold hover:bg-slate-800'}`}>
                                                    {mult}x
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Unrealized PnL</span>
                                        <div className="flex items-center gap-3">
                                            <span className={`font-black text-2xl drop-shadow-[0_0_10px_rgba(6,249,6,0.4)] ${userPosition.unrealizedPnl >= 0 ? 'text-primary' : 'text-red-500'}`}>
                                                {userPosition.unrealizedPnl >= 0 ? '+' : ''}${userPosition.unrealizedPnl.toFixed(2)}
                                            </span>
                                            {userPosition.positionSide !== 0 && <span className="size-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_12px_#06f906]"></span>}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-mono">
                                        <span className="text-slate-500 uppercase">Liq. Price</span>
                                        <span className="text-red-400 font-bold">${userPosition.liquidationPrice ? userPosition.liquidationPrice.toFixed(2) : '---'}</span>
                                    </div>
                                    {userPosition.positionSide !== 0 && (
                                        <div className="flex justify-between items-center text-xs font-mono">
                                            <span className="text-slate-500 uppercase">Position</span>
                                            <span className={userPosition.positionSide === 1 ? 'text-primary font-bold' : 'text-red-500 font-bold'}>
                                                {userPosition.positionSide === 1 ? 'LONG' : 'SHORT'} {userPosition.positionSize.toFixed(2)} SOL @ {userPosition.leverage}x
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <button onClick={executeTrade}
                                    className="w-full py-3 md:py-4 bg-primary/5 border-2 border-primary text-primary rounded-xl font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-sm md:text-base hover:bg-primary hover:text-background-dark transition-all shadow-[inset_0_0_20px_rgba(6,249,6,0.1)]">
                                    {isInitialized ? 'Execute Market Order' : 'Initializing Arena...'}
                                </button>
                            </div>

                            <div className="hidden lg:flex flex-1 glass p-5 rounded-2xl overflow-y-auto">
                                <h3 className="text-[10px] uppercase font-black text-accent-purple tracking-[0.25em] mb-5 border-b border-accent-purple/20 pb-2">Arena Trade Feed</h3>
                                <div className="space-y-4">
                                    {tradeFeed.map((trade) => (
                                        <div key={trade.id} className="flex justify-between items-center text-[11px]">
                                            <span className={trade.side === 'LONG' ? 'text-primary font-bold' : 'text-red-500 font-bold'}>
                                                {trade.side} {trade.size.toFixed(1)} SOL
                                            </span>
                                            <span className="text-slate-500 font-mono">{trade.time}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </aside>
                    </div>

                    <footer className="hidden md:flex h-80 p-4 gap-4 relative">
                        <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden relative">
                            <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center z-40">
                                <div className="confetti bg-primary" style={{ left: '20%', animationDelay: '0.2s' }}></div>
                                <div className="confetti bg-accent-purple" style={{ left: '35%', animationDelay: '0.5s' }}></div>
                                <div className="confetti bg-primary" style={{ left: '45%', animationDelay: '0.8s' }}></div>
                                <div className="confetti bg-accent-purple" style={{ left: '55%', animationDelay: '0.1s' }}></div>
                                <div className="confetti bg-primary" style={{ left: '65%', animationDelay: '1.2s' }}></div>
                                <div className="confetti bg-accent-purple" style={{ left: '80%', animationDelay: '0.4s' }}></div>
                                <div className="confetti bg-primary" style={{ left: '25%', animationDelay: '1.5s', width: '6px', height: '12px' }}></div>
                                <div className="confetti bg-accent-purple" style={{ left: '75%', animationDelay: '1.8s', width: '10px', height: '10px', borderRadius: '50%' }}></div>
                            </div>
                            <div className="px-8 py-5 border-b border-primary/20 flex justify-between items-center bg-primary/10">
                                <h3 className="text-lg font-black italic flex items-center gap-3 tracking-tighter uppercase">
                                    <span className="material-symbols-outlined text-primary text-3xl drop-shadow-[0_0_10px_rgba(6,249,6,0.6)]">leaderboard</span>
                                    Live Arena Leaderboard
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-primary animate-ping"></span>
                                    <span className="text-[11px] text-primary/80 uppercase font-black tracking-widest">3,241 Traders Battling</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-x-auto relative z-10">
                                <table className="w-full text-left text-sm border-separate border-spacing-y-2 px-4">
                                    <thead className="text-slate-500 uppercase tracking-[0.2em] text-[10px] font-black">
                                        <tr>
                                            <th className="px-6 py-3">Rank</th>
                                            <th className="px-6 py-3">Wallet Address</th>
                                            <th className="px-6 py-3 text-center">Win Rate</th>
                                            <th className="px-6 py-3">24H PnL %</th>
                                            <th className="px-6 py-3">Streak</th>
                                            <th className="px-6 py-3 text-right">Arena Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="space-y-2">
                                        {leaderboard.map((player) => (
                                            <tr key={player.rank} className={`${player.rank === 1 ? 'bg-primary/5 animate-glow-pulse border-2 border-primary/30' : 'hover:bg-white/5 border border-transparent'} rounded-xl transition-all group`}>
                                                <td className={`px-6 py-5 font-black text-lg italic ${player.rank === 1 ? 'text-primary' : player.rank === 2 ? 'text-slate-300' : 'text-slate-400'}`}>#{player.rank}</td>
                                                <td className={`px-6 py-5 font-mono font-bold tracking-widest ${player.rank === 1 ? '' : 'text-slate-400'}`}>
                                                    {player.isUser ? getUserDisplayName() : player.address}
                                                    {player.isUser && username && <span className="ml-2 text-[10px] text-primary/60">(You)</span>}
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <span className={`${player.rank === 1 ? 'bg-primary/20 text-primary' : 'bg-slate-800 text-slate-300'} px-3 py-1 rounded-full font-black`}>{player.winRate}%</span>
                                                </td>
                                                <td className={`px-6 py-5 font-black text-lg drop-shadow-[0_0_8px_rgba(6,249,6,0.5)] ${player.rank === 1 ? 'text-primary' : 'text-primary'}`}>+{player.pnl.toFixed(1)}%</td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`material-symbols-outlined ${player.rank === 1 ? 'text-orange-500 text-xl animate-bounce' : 'text-lg text-orange-400'}`}>local_fire_department</span>
                                                        <span className={`font-black ${player.rank === 1 ? 'text-orange-500' : 'text-orange-400'}`}>{player.streak} WINS</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <button className={`${player.rank === 1 ? 'bg-primary text-background-dark px-6 shadow-[0_0_15px_rgba(6,249,6,0.4)] hover:scale-110' : 'bg-slate-800 text-slate-400 px-4 hover:text-white'} font-black py-2 rounded-xl text-xs uppercase tracking-widest transition-transform`}>
                                                        {player.rank === 1 ? 'Copy Plays' : 'Copy'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* My Rank Section - Only show when connected */}
                                {wallet ? (
                                    <div className="mt-4 px-4 py-4 bg-primary/5 border border-primary/20 rounded-xl">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs uppercase font-black text-primary tracking-widest">Your Position</h4>
                                            <span className="text-[10px] text-slate-500">{userRank.behindLeader.toFixed(1)}% behind #1</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-2xl font-black text-primary italic">#{userRank.rank}</div>
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-200">{getUserDisplayName()}</p>
                                                <p className="text-[10px] text-slate-500 font-mono">
                                                    {wallet?.publicKey?.toString().slice(0, 6)}...{wallet?.publicKey?.toString().slice(-4)}
                                                </p>
                                            </div>
                                            <div className="flex gap-4 text-center">
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Win Rate</p>
                                                    <p className="font-black text-slate-300">{userRank.winRate}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">PnL</p>
                                                    <p className="font-black text-primary">+{userRank.pnl.toFixed(1)}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Streak</p>
                                                    <p className="font-black text-orange-500">{userRank.streak} 🔥</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 px-4 py-4 bg-surface-dark/50 border border-border-dark rounded-xl text-center">
                                        <p className="text-slate-400 text-sm mb-2">Connect your wallet to see your position</p>
                                        <button
                                            onClick={() => document.querySelector('.wallet-adapter-button')?.click()}
                                            className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg text-sm font-bold transition-all"
                                        >
                                            Connect Wallet
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="hidden md:flex w-80 glass rounded-2xl flex-col p-5 gap-4 bg-accent-purple/10 border-accent-purple/40">
                            <h3 className="text-[10px] uppercase font-black text-accent-purple tracking-[0.3em] flex items-center justify-between">
                                Arena Chat
                                <span className="size-2 rounded-full bg-accent-purple animate-pulse"></span>
                            </h3>
                            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-hide">
                                {chatMessages.map((msg) => (
                                    <div key={msg.id} className={`text-[11px] p-2 rounded-lg ${msg.type === 'user' ? `bg-white/5 border-l-2 border-${msg.color}` : ''}`}>
                                        <span className={`text-${msg.color} font-black`}>{msg.user}:</span>
                                        <span className="text-slate-300 ml-1">{msg.text}</span>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="relative mt-2 group">
                                <input
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyPress={handleChatKeyPress}
                                    className="w-full bg-black border-2 border-slate-800 rounded-xl text-xs py-3 px-4 pr-10 focus:border-accent-purple focus:ring-0 transition-all group-hover:border-slate-700"
                                    placeholder="Type combat comms..."
                                    type="text"
                                />
                                <button onClick={sendChatMessage} className="absolute right-3 top-1/2 -translate-y-1/2 text-accent-purple hover:scale-125 transition-transform">
                                    <span className="material-symbols-outlined text-xl">send</span>
                                </button>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
                    <div className="glass bg-background-dark/95 border border-primary/30 rounded-2xl p-8 w-full max-w-md relative shadow-[0_0_50px_rgba(6,249,6,0.2)]">
                        <button onClick={() => setShowSettingsModal(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 text-primary">Arena Settings</h2>
                        <p className="text-slate-400 text-sm mb-6">Customize your trader profile</p>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em]">Display Name</label>
                                <input
                                    value={tempUsername}
                                    onChange={(e) => setTempUsername(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && saveUsername()}
                                    className="w-full bg-black/60 border-2 border-slate-800 focus:border-primary focus:ring-0 rounded-xl px-4 py-3 font-mono text-lg transition-all"
                                    placeholder="Enter your trader name..."
                                    type="text"
                                    maxLength={20}
                                />
                                <p className="text-[10px] text-slate-500">This will be shown on the leaderboard instead of your wallet address</p>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">wallet</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400">Connected Wallet</p>
                                        <p className="font-mono text-sm text-slate-200">
                                            {wallet?.publicKey?.toString().slice(0, 6)}...{wallet?.publicKey?.toString().slice(-4)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setShowSettingsModal(false)}
                                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={saveUsername}
                                    className="flex-1 py-3 bg-primary text-background-dark rounded-xl font-black uppercase tracking-wider hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(6,249,6,0.3)]">
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-primary/20 flex items-center justify-around bg-background-dark/95 backdrop-blur-xl z-50">
                <button onClick={() => setActiveTab('trading')}
                    className={`flex flex-col items-center gap-1 p-2 transition-all ${activeTab === 'trading' ? 'text-primary' : 'text-slate-500'}`}
                >
                    <span className="material-symbols-outlined text-2xl">query_stats</span>
                    <span className="text-[10px]">Trade</span>
                </button>
                <button onClick={() => navigate('/tournament')}
                    className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-primary transition-all"
                >
                    <span className="material-symbols-outlined text-2xl">leaderboard</span>
                    <span className="text-[10px]">Ranking</span>
                </button>
                <button onClick={() => navigate('/')}
                    className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-primary transition-all"
                >
                    <span className="material-symbols-outlined text-2xl">home</span>
                    <span className="text-[10px]">Home</span>
                </button>
                <button onClick={() => { setTempUsername(username); setShowSettingsModal(true); }}
                    className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-primary transition-all"
                >
                    <span className="material-symbols-outlined text-2xl">settings</span>
                    <span className="text-[10px]">Settings</span>
                </button>
            </nav>
        </div>
    );
}
