# Solana Arena

**Solana Arena** is a real-time trading competition built on **Solana** and designed to run on **MagicBlock Ephemeral Rollups (ER)**.

The platform transforms trading into a competitive game where players enter timed arenas, open leveraged positions, survive liquidation, and compete on a leaderboard to win prizes.

Instead of trading real assets directly, players use a **virtual balance** and compete based on performance, strategy, and risk management.

---

# Inspiration

Trading is often complex and intimidating for new users.

We wanted to turn trading into something:

• Competitive  
• Educational  
• Fun  
• Social  

Solana Arena gamifies trading by introducing **battle-style trading arenas** where players compete in short rounds to see who is the best trader.

---

# Key Features

### Competitive Trading Rounds
Players join an arena round and compete using a **virtual trading balance**.

### Real-Time Leaderboards
The platform tracks player performance and ranks traders in real time.

### Long & Short Trading
Players can take **long or short positions** on SOL price movements.

### Liquidation Mechanics
If a player's balance drops below a threshold, they are **liquidated** and eliminated from the round.

### Prize Pool Distribution
Players pay a small **entry fee**, creating a prize pool that is distributed to the **top 3 winners**.

---

# How It Works

### 1. Lobby Phase
Players join an arena before the round starts.

• Entry fee is paid  
• Player session is created  
• Virtual trading balance initialized  

### 2. Trading Phase
Once the lobby closes, the round begins.

Players can:

• Open long positions  
• Open short positions  
• Manage leverage  
• Close positions  

The goal is to **grow the highest equity before the round ends**.

### 3. Liquidation
Players whose balance falls below the **liquidation threshold** are removed from the round.

### 4. Final Leaderboard
At the end of the round:

• All positions are closed  
• Player equity is calculated  
• Winners are ranked  

### 5. Prize Distribution
Top players receive the prize pool automatically.

1st Place — 50%  
2nd Place — 30%  
3rd Place — 20%

---

# MagicBlock Integration

Solana Arena is designed to run on **MagicBlock Ephemeral Rollups**.

Ephemeral Rollups allow:

• High-frequency gameplay interactions  
• Gasless trading operations  
• Fast round execution  
• Temporary game state processing  
• Final settlement on Solana  

Each trading round executes inside an **Ephemeral Rollup environment** where:

• player sessions update in real time  
• trading actions execute instantly  
• leaderboard updates continuously  

After the round ends, the final results are settled back to **Solana main state**.

This architecture allows Solana Arena to support **high-speed gameplay that would not be feasible directly on L1**.

---

# Price Data

Solana Arena uses **Binance Market Data API** to power the trading chart.

The Binance API provides:

• Real-time price updates  
• Historical candlestick data  
• High liquidity reference prices  

This allows players to trade against **real market conditions** while competing in the arena.

Example endpoint used:
This provides candlestick data for rendering the live chart in the trading dashboard.

---

# Smart Contract

The platform uses a **Solana Anchor program** that manages:

• Arena configuration  
• Round lifecycle  
• Player sessions  
• Trade execution  
• Leaderboards  
• Prize distribution  

Main on-chain components:

ArenaConfig  
Global arena configuration

ArenaRound  
Represents a single competition round

PlayerSession  
Tracks a player's performance during a round

PlayerProfile  
Stores player statistics and wins

---

# Architecture
Frontend React + Vite Trading Dashboard
↓
Game Engine Solana Smart Contract (Anchor)
↓
Execution Layer MagicBlock Ephemeral Rollups
↓
Settlement Layer Solana Network
↓
Market Data Binance API
---

# Technology Stack

Frontend

• React  
• Vite  
• Tailwind CSS  

Blockchain

• Solana  
• Anchor Framework  

Execution Layer

• MagicBlock Ephemeral Rollups  

Market Data

• Binance API  

Wallet

• Solana Wallet Adapter  

---

## Tagline

**Solana Arena** is a real-time trading competition platform where players battle using trading strategies in fast-paced arena rounds powered by **Solana** and **MagicBlock Ephemeral Rollups**.

---

## Current MVP Interface

The current interface demonstrates the core trading experience:

• Wallet connection  
• Trading dashboard  
• Long / Short position controls  
• Live price charts powered by Binance API  
• Real-time performance tracking  

Additional UI components such as the **round lobby, tournament entry system, and automated round management** are part of the next development phase and are already supported in the smart contract logic.

---

## Use Cases

### Learn Trading Without Risk
New users can practice trading strategies in a competitive environment without risking real funds.

### Competitive Trading Tournaments
Communities can host tournaments where traders compete for rewards and recognition.

### Esports-Style Trading
Solana Arena transforms trading into a competitive experience where players compete in timed rounds and spectators can follow live leaderboards.

### DeFi Education
The platform can be used to teach key trading concepts such as:

• leverage  
• liquidation  
• risk management  
• market timing  

This creates an engaging environment for learning how real markets behave.

---

## Security and Fairness

Solana Arena uses transparent on-chain logic to ensure fairness and trust.

• All round results are verified on-chain  
• Leaderboards cannot be manipulated  
• Prize distribution is executed by the smart contract  
• Player sessions are deterministic using PDAs  
• Market data is sourced from real-world price feeds  

This guarantees that all outcomes are determined by verifiable smart contract logic.

---

## Impact

Solana Arena introduces a new category of **competitive finance**, combining elements of:

• gaming  
• trading  
• blockchain transparency  

By transforming trading into a competitive arena, the platform lowers the barrier for new traders while creating a social and educational experience around financial markets.

# Example Game Flow

1. Player connects wallet
2. Player joins arena round
3. Entry fee added to prize pool
4. Round begins
5. Players trade using long/short positions
6. Liquidated players are eliminated
7. Final leaderboard calculated
8. Winners receive prize pool

---

# Roadmap

Phase 1 — Hackathon MVP

• Trading dashboard  
• Arena rounds  
• Long / short trading  
• Leaderboard system  
• Entry fee prize pool  

Phase 2 — MagicBlock Optimization

• Full Ephemeral Rollup execution  
• Gasless trading interactions  
• High-frequency state updates  

Phase 3 — Advanced Features

• NFT trophies for winners  
• Seasonal tournaments  
• Social trading profiles  
• Spectator mode  

---

# Why Solana

Solana provides:

• High throughput  
• Low fees  
• Fast transaction finality  

This makes it ideal for **real-time competitive applications like Solana Arena**.

---

# Why MagicBlock

MagicBlock enables:

• high-frequency gameplay logic  
• fast round execution  
• temporary rollup environments  
• scalable game state updates  

This allows Solana Arena to behave more like a **real-time game engine than a traditional blockchain app**.

---

# Future Vision

Solana Arena aims to become a **global competitive trading platform** where players can:

• join tournaments  
• compete in leagues  
• earn rewards  
• build reputation as traders  

By combining **trading, gaming, and blockchain**, Solana Arena introduces a new category of competitive finance.

---

# Repository

GitHub Repository


npm install
npm run dev
``````bash```bash
git clone https://github.com/okelo0121/solana-arena.git
cd solana-arena
npm install
npm run dev
```
---

# Built For

MagicBlock Hackathon
