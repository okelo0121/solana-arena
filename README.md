# Solana Arena ⚔️

**Trade. Compete. Dominate.**

Solana Arena is a real-time, on-chain trading competition and prediction game built on Solana. Participate in fast-paced trading rounds with virtual balances modeled after real-time cryptocurrency fluctuations, driven by Pyth Network's high-fidelity oracle price feeds. 

Experience gasless, instantaneous trade execution with Ephemeral Rollups and compete against other gladiators for top ranks, digital trophies, and prize pools.

## 🌟 Key Features

*   **Real-Time Price Feeds:** Powered by [Pyth Network's Oracle Feeds](https://pyth.network/) for millisecond precision on asset prices like `SOL/USD`.
*   **Virtual Margin Trading:** Start each round with a virtual balance ($100 USD = 100,000,000 lamports) and trade with up to 50x leverage.
*   **Instant Execution:** Seamlessly open Long or Short positions and realize PnL with lightning-fast Solana smart contracts.
*   **Liquidation Mechanics:** Automatically liquidate positions when equity falls below the 20% margin threshold, keeping the competition fierce.
*   **Tournament Leaderboard:** Climb the ranks based on your final equity and win percentage to secure your share of the prize pool (50% / 30% / 20%).
*   **Digital Trophies:** Exclusive NFT trophies ("Grand Champion," "Season Elite," "Top Trader," "Whale Hunter") awarded to the ultimate trading gladiators.

## 🛠 Tech Stack

*   **Frontend:** React, Vite, Tailwind CSS, React Router
*   **Blockchain Integration:** `@solana/web3.js`, `@solana/wallet-adapter-react`, Anchor Framework
*   **Oracles:** Pyth Network (`@pythnetwork/pyth-solana-receiver`, Hermes API)
*   **Smart Contracts:** Rust (Anchor), deployed on Solana Devnet/Mainnet
*   **Styling:** Modern, glassmorphism UI with vibrant colors and micro-animations for a premium feel.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   Yarn or npm or pnpm
*   Anchor CLI & Rust (if modifying the smart contracts)
*   A Solana Wallet (Phantom, Solflare, etc.)

### Installation & Setup

1. **Install dependencies:**
    ```bash
    npm install
    ```

2. **Set up local environment (.env):**
    Create a `.env` file in the root if necessary to hold environment variables like API endpoints or RPC URLs.

3. **Start the development server:**
    ```bash
    npm run dev
    ```

4. **Build for production:**
    ```bash
    npm run build
    ```

### Smart Contract Deployment

The Anchor smart contract is located under `solana_arena/programs/solana_arena`. To deploy and test locally:

1. Navigate to the Anchor workspace: `cd solana_arena`
2. Build the contract: `anchor build`
3. Deploy to devnet: `anchor deploy --provider.cluster devnet` (make sure to configure `Anchor.toml` and your local wallet).

## 📖 How It Works

1. **Connect Wallet:** Securely connect your Phantom or Solflare wallet.
2. **Join a Room:** The platform holds continuous rounds. Pay the entry fee in SOL to join the lobby.
3. **Trade & Dominate:** Once the round is live, use your virtual margin to take Long or Short positions. Monitor your unrealized PnL, avoid liquidations, and close your positions for profit.
4. **Finalize Round:** At the end of the round duration, the round is finalized, and smart contracts automatically distribute the prize pool according to the final leaderboards.

## 📜 License
This project is for Hackathon purposes. (c) 2024 Solana Arena. All rights reserved. Not financial advice.
