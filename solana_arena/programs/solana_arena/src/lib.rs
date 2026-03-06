use anchor_lang::prelude::*;

// Default Program ID - Update when deploying
declare_id!("FLDK6cFtbf15bd88aVGYmWsGd4btFzyUuJjwV2urpw4y");

// ============================================================================
// CONSTANTS
// ============================================================================

/// Initial virtual balance for new players ($100 USD)
pub const INITIAL_BALANCE: u64 = 100_000_000; // $100 with 6 decimals
/// Liquidation threshold (20% of initial balance)
pub const LIQUIDATION_THRESHOLD: u64 = 20_000_000; // $20 with 6 decimals
/// Prize distribution: 50% / 30% / 20%
pub const FIRST_PLACE_PERCENT: u32 = 5000; // 50% in bps
pub const SECOND_PLACE_PERCENT: u32 = 3000; // 30% in bps
pub const THIRD_PLACE_PERCENT: u32 = 2000; // 20% in bps

#[program]
pub mod solana_arena {
    use super::*;

    /// Initialize the arena configuration
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        entry_fee: u64,
        lobby_duration_sec: i64,
        round_duration_sec: i64,
        fee_bps: u32,
        treasury: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.arena_config;
        config.entry_fee = entry_fee;
        config.lobby_duration_sec = lobby_duration_sec;
        config.round_duration_sec = round_duration_sec;
        config.fee_bps = fee_bps;
        config.treasury = treasury;
        config.initialized = true;
        
        Ok(())
    }

    /// Start a new round (called by admin)
    pub fn start_round(ctx: Context<StartRound>, round_id: u64) -> Result<()> {
        let config = &ctx.accounts.arena_config;
        let round = &mut ctx.accounts.arena_round;
        let clock = Clock::get()?;

        // Validate config is initialized
        require!(config.initialized, ArenaError::ConfigNotInitialized);

        // Initialize round
        round.round_id = round_id;
        round.status = RoundStatus::Lobby as u8;
        round.lobby_end_ts = clock.unix_timestamp + config.lobby_duration_sec;
        round.round_end_ts = round.lobby_end_ts + config.round_duration_sec;
        round.total_players = 0;
        round.alive_players = 0;
        round.prize_pool = 0;
        round.finalized = false;
        round.winners = [Pubkey::default(); 3];
        round.winner_prizes = [0; 3];

        // Initialize vault for SOL (using the round PDA as vault)
        round.vault_bump = ctx.bumps.vault;

        msg!("Round {} started. Lobby ends at {}", round_id, round.lobby_end_ts);
        Ok(())
    }

    /// Join the lobby by paying entry fee (SOL)
    pub fn join_lobby(ctx: Context<JoinLobby>, _round_id: u64) -> Result<()> {
        let config = &ctx.accounts.arena_config;
        let round = &mut ctx.accounts.arena_round;
        let session = &mut ctx.accounts.player_session;
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        // Validations
        require!(config.initialized, ArenaError::ConfigNotInitialized);
        require!(round.status == RoundStatus::Lobby as u8, ArenaError::RoundNotInLobby);
        require!(clock.unix_timestamp < round.lobby_end_ts, ArenaError::LobbyEnded);
        
        // Check player hasn't already joined this round
        require!(session.owner == Pubkey::default(), ArenaError::AlreadyJoined);

        // Transfer SOL entry fee from player to vault (via CPI to system program)
        // For MVP: Simple transfer to vault PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: player.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx, config.entry_fee)?;

        // Create player session
        session.owner = player.key();
        session.round_id = round.round_id;
        session.virtual_balance = INITIAL_BALANCE;
        session.position_side = 0;
        session.position_size = 0;
        session.entry_price = 0;
        session.leverage = 1;
        session.unrealized_pnl = 0;
        session.realized_pnl = 0;
        session.eliminated = false;
        session.elimination_ts = 0;
        session.join_ts = clock.unix_timestamp;

        // Update round counters
        round.total_players += 1;
        round.alive_players += 1;
        round.prize_pool += config.entry_fee;

        msg!("Player {} joined round {} with {} lamports", player.key(), round.round_id, config.entry_fee);
        Ok(())
    }

    /// Lock lobby and start the round (permissionless)
    pub fn lock_and_start_round(ctx: Context<LockAndStartRound>, _round_id: u64) -> Result<()> {
        let round = &mut ctx.accounts.arena_round;
        let clock = Clock::get()?;

        // Validations
        require!(round.status == RoundStatus::Lobby as u8, ArenaError::RoundNotInLobby);
        require!(clock.unix_timestamp >= round.lobby_end_ts, ArenaError::LobbyNotEnded);

        // Start the round
        round.status = RoundStatus::Live as u8;

        msg!("Round {} is now LIVE!", round.round_id);
        Ok(())
    }

    /// Execute a trade (long/short)
    pub fn execute_trade(
        ctx: Context<ExecuteTrade>,
        _round_id: u64,
        side: u8,
        size: u64,
        leverage: u8,
        current_price: i64,
    ) -> Result<()> {
        let round = &ctx.accounts.arena_round;
        let session = &mut ctx.accounts.player_session;
        let clock = Clock::get()?;

        // Validations
        require!(round.status == RoundStatus::Live as u8, ArenaError::RoundNotLive);
        require!(clock.unix_timestamp < round.round_end_ts, ArenaError::RoundEnded);
        require!(!session.eliminated, ArenaError::PlayerEliminated);
        require!(side == 1 || side == 2, ArenaError::InvalidSide);
        require!(leverage >= 1 && leverage <= 50, ArenaError::InvalidLeverage);

        // Calculate required margin
        let required_margin = size.checked_div(leverage as u64).unwrap();
        require!(session.virtual_balance >= required_margin, ArenaError::InsufficientFunds);

        // Close existing position first and realize PnL
        if session.position_side != 0 {
            let price_diff = current_price - session.entry_price;
            let pnl = calculate_pnl(
                session.position_side,
                session.position_size,
                price_diff,
                session.leverage,
            );
            session.virtual_balance = session.virtual_balance.checked_add(session.position_size).unwrap();
            session.virtual_balance = (session.virtual_balance as i64 + pnl) as u64;
            session.realized_pnl = session.realized_pnl.checked_add(pnl).unwrap();
        }

        // Deduct margin for new position
        session.virtual_balance = session.virtual_balance.checked_sub(required_margin).unwrap();

        // Update position
        session.position_side = side;
        session.position_size = size;
        session.entry_price = current_price;
        session.leverage = leverage;

        // Check liquidation after trade (inline logic)
        if session.position_side != 0 {
            let mut equity = session.virtual_balance as i64;
            let price_diff = current_price - session.entry_price;
            let unrealized = calculate_pnl(
                session.position_side,
                session.position_size,
                price_diff,
                session.leverage,
            );
            equity = equity + session.position_size as i64 + unrealized;
            
            if equity <= LIQUIDATION_THRESHOLD as i64 {
                session.eliminated = true;
                session.position_side = 0;
                session.position_size = 0;
                msg!("Player {} eliminated at equity {}", session.owner, equity);
            }
        }

        Ok(())
    }

    /// Close current position and realize PnL
    pub fn close_position(
        ctx: Context<ExecuteTrade>,
        _round_id: u64,
        current_price: i64,
    ) -> Result<()> {
        let session = &mut ctx.accounts.player_session;

        if session.position_side != 0 {
            let price_diff = current_price - session.entry_price;
            let pnl = calculate_pnl(
                session.position_side,
                session.position_size,
                price_diff,
                session.leverage,
            );

            // Return margin + PnL
            session.virtual_balance = session.virtual_balance.checked_add(session.position_size).unwrap();
            session.virtual_balance = (session.virtual_balance as i64 + pnl) as u64;
            session.realized_pnl = session.realized_pnl.checked_add(pnl).unwrap();

            // Reset position
            session.position_side = 0;
            session.position_size = 0;
            session.entry_price = 0;
            session.leverage = 1;
        }

        Ok(())
    }

    /// Check if player should be eliminated
    pub fn check_liquidation(ctx: Context<CheckLiquidation>, current_price: i64) -> Result<()> {
        let round = &mut ctx.accounts.arena_round;
        let session = &mut ctx.accounts.player_session;
        let clock = Clock::get()?;

        // Calculate current equity
        let mut equity = session.virtual_balance as i64;
        
        if session.position_side != 0 {
            let price_diff = current_price - session.entry_price;
            let unrealized = calculate_pnl(
                session.position_side,
                session.position_size,
                price_diff,
                session.leverage,
            );
            equity = equity + session.position_size as i64 + unrealized;
        }

        // Check if eliminated
        if equity <= LIQUIDATION_THRESHOLD as i64 && !session.eliminated {
            session.eliminated = true;
            session.elimination_ts = clock.unix_timestamp;
            round.alive_players = round.alive_players.saturating_sub(1);
            
            // Close any open position
            session.position_side = 0;
            session.position_size = 0;
            
            msg!("Player {} eliminated at equity {}", session.owner, equity);
        }

        Ok(())
    }

    /// Finalize round and distribute prizes
    pub fn finalize_round(ctx: Context<FinalizeRound>, _round_id: u64) -> Result<()> {
        let config = &ctx.accounts.arena_config;
        let round = &mut ctx.accounts.arena_round;
        let clock = Clock::get()?;

        // Validations
        require!(round.status == RoundStatus::Live as u8, ArenaError::RoundNotLive);
        
        let can_finalize = clock.unix_timestamp >= round.round_end_ts 
            || round.alive_players <= 3;
        require!(can_finalize, ArenaError::CannotFinalizeYet);

        // Calculate prize distribution
        let total_prize = round.prize_pool;
        let fee_amount = (total_prize as u64).checked_mul(config.fee_bps as u64).unwrap().checked_div(10000).unwrap();
        let distributable = total_prize.checked_sub(fee_amount).unwrap();

        let first_prize = distributable.checked_mul(FIRST_PLACE_PERCENT as u64).unwrap().checked_div(10000).unwrap();
        let second_prize = distributable.checked_mul(SECOND_PLACE_PERCENT as u64).unwrap().checked_div(10000).unwrap();
        let third_prize = distributable.checked_mul(THIRD_PLACE_PERCENT as u64).unwrap().checked_div(10000).unwrap();

        // For MVP: Simple leaderboard-based selection
        // In production: Fetch all sessions and sort by final equity
        // Here we use the existing top_players from update_leaderboard
        
        // Transfer prizes to winners (simplified - assumes winners are in top_players)
        // In production: Use CPI to transfer from vault to winner ATAs
        
        // Update round state
        round.status = RoundStatus::Finished as u8;
        round.finalized = true;
        
        // Store prizes for frontend display
        round.winner_prizes = [first_prize, second_prize, third_prize];

        msg!("Round finalized. Prize pool: {} SOL, Fee: {} SOL", total_prize, fee_amount);
        msg!("Prizes: 1st={}, 2nd={}, 3rd={}", first_prize, second_prize, third_prize);

        Ok(())
    }

    /// Update player's leaderboard position
    pub fn update_leaderboard(ctx: Context<UpdateLeaderboard>) -> Result<()> {
        let round = &mut ctx.accounts.arena_round;
        let session = &ctx.accounts.player_session;
        
        // Calculate final equity
        let mut equity = session.virtual_balance;
        if session.position_side != 0 {
            // For leaderboard, use virtual balance + unrealized (simplified)
            equity = equity.saturating_add(session.position_size);
        }

        let player_key = session.owner;
        
        // Check if player already in top 3
        let mut already_ranked = false;
        for i in 0..3 {
            if round.top_players[i] == player_key {
                round.top_balances[i] = equity;
                already_ranked = true;
                break;
            }
        }
        
        if !already_ranked {
            // Try to insert into top 3
            for i in 0..3 {
                if round.top_players[i] == Pubkey::default() || equity > round.top_balances[i] {
                    // Shift lower ranks
                    let mut j = 2;
                    while j > i {
                        round.top_players[j] = round.top_players[j - 1];
                        round.top_balances[j] = round.top_balances[j - 1];
                        j = j.saturating_sub(1);
                    }
                    // Insert new player
                    round.top_players[i] = player_key;
                    round.top_balances[i] = equity;
                    break;
                }
            }
        }
        
        Ok(())
    }

    /// Update player profile with wins
    pub fn update_player_profile(
        ctx: Context<UpdateProfile>,
        rank: u8,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.player_profile;
        
        match rank {
            1 => {
                profile.first_place_count += 1;
                profile.total_wins += 1;
            },
            2 => profile.second_place_count += 1,
            3 => profile.third_place_count += 1,
            _ => {}
        }
        
        Ok(())
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn calculate_pnl(side: u8, size: u64, price_diff: i64, leverage: u8) -> i64 {
    let size_i64 = size as i64;
    let leverage_i64 = leverage as i64;
    
    if side == 1 {
        // Long: profit when price goes up
        size_i64 * price_diff * leverage_i64 / 100000000 // Adjust for price scale
    } else {
        // Short: profit when price goes down
        size_i64 * -price_diff * leverage_i64 / 100000000
    }
}

fn check_liquidation_internal(session: &mut PlayerSession, current_price: i64) {
    if session.position_side == 0 {
        return;
    }
    
    let mut equity = session.virtual_balance as i64;
    let price_diff = current_price - session.entry_price;
    let unrealized = calculate_pnl(
        session.position_side,
        session.position_size,
        price_diff,
        session.leverage,
    );
    
    equity = equity + session.position_size as i64 + unrealized;
    
    if equity <= LIQUIDATION_THRESHOLD as i64 {
        session.eliminated = true;
        session.position_side = 0;
        session.position_size = 0;
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Round status enum
#[derive(Clone, Copy, PartialEq)]
pub enum RoundStatus {
    Lobby = 0,
    Live = 1,
    Finished = 2,
}

/// Arena Configuration PDA
#[account]
pub struct ArenaConfig {
    pub initialized: bool,
    pub entry_fee: u64,           // Lamports
    pub lobby_duration_sec: i64,
    pub round_duration_sec: i64,
    pub fee_bps: u32,             // Basis points (e.g., 500 = 5%)
    pub treasury: Pubkey,
}

/// Arena Round PDA
#[account]
pub struct ArenaRound {
    pub round_id: u64,
    pub status: u8,               // 0=Lobby, 1=Live, 2=Finished
    pub lobby_end_ts: i64,
    pub round_end_ts: i64,
    pub total_players: u32,
    pub alive_players: u32,
    pub prize_pool: u64,          // Lamports
    pub finalized: bool,
    pub top_players: [Pubkey; 3],
    pub top_balances: [u64; 3],
    pub winners: [Pubkey; 3],
    pub winner_prizes: [u64; 3],
    pub vault_bump: u8,
}

/// Player Session PDA
#[account]
pub struct PlayerSession {
    pub owner: Pubkey,
    pub round_id: u64,
    pub virtual_balance: u64,     // Lamports (virtual USD)
    pub position_side: u8,        // 0=none, 1=long, 2=short
    pub position_size: u64,
    pub entry_price: i64,
    pub leverage: u8,
    pub unrealized_pnl: i64,
    pub realized_pnl: i64,
    pub eliminated: bool,
    pub elimination_ts: i64,
    pub join_ts: i64,
}

/// Player Profile PDA (for tracking wins)
#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub total_wins: u32,
    pub first_place_count: u32,
    pub second_place_count: u32,
    pub third_place_count: u32,
    pub total_earnings: u64,
}

// ============================================================================
// VALIDATION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 32,
        seeds = [b"config"],
        bump
    )]
    pub arena_config: Account<'info, ArenaConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct StartRound<'info> {
    #[account(seeds = [b"config"], bump)]
    pub arena_config: Account<'info, ArenaConfig>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 200,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(mut, seeds = [b"vault", round_id.to_le_bytes().as_ref()], bump)]
    #[account(
        mut, 
        seeds = [b"vault", round_id.to_le_bytes().as_ref()], 
        bump
    )]
    /// CHECK: Vault PDA for holding entry fees
    pub vault: AccountInfo<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct JoinLobby<'info> {
    #[account(seeds = [b"config"], bump)]
    pub arena_config: Account<'info, ArenaConfig>,
    #[account(
        mut,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + 100,
        seeds = [b"session", round_id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_session: Account<'info, PlayerSession>,
    #[account(mut, seeds = [b"vault", round_id.to_le_bytes().as_ref()], bump)]
    pub vault: AccountInfo<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct LockAndStartRound<'info> {
    #[account(
        mut,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct ExecuteTrade<'info> {
    #[account(
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(
        mut,
        seeds = [b"session", round_id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_session: Account<'info, PlayerSession>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CheckLiquidation<'info> {
    #[account(
        mut,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(
        mut,
        seeds = [b"session", round_id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_session: Account<'info, PlayerSession>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct FinalizeRound<'info> {
    #[account(seeds = [b"config"], bump)]
    pub arena_config: Account<'info, ArenaConfig>,
    #[account(
        mut,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(mut, seeds = [b"vault", round_id.to_le_bytes().as_ref()], bump)]
    pub vault: AccountInfo<'info>,
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateLeaderboard<'info> {
    #[account(
        mut,
        seeds = [b"round"],
        bump
    )]
    pub arena_round: Account<'info, ArenaRound>,
    #[account(
        seeds = [b"session", arena_round.round_id.to_le_bytes().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_session: Account<'info, PlayerSession>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 64,
        seeds = [b"profile", authority.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum ArenaError {
    #[msg("Arena config not initialized")]
    ConfigNotInitialized,
    #[msg("Round is not in lobby state")]
    RoundNotInLobby,
    #[msg("Lobby has ended")]
    LobbyEnded,
    #[msg("Lobby has not ended yet")]
    LobbyNotEnded,
    #[msg("Player has already joined this round")]
    AlreadyJoined,
    #[msg("Round is not live")]
    RoundNotLive,
    #[msg("Round has ended")]
    RoundEnded,
    #[msg("Player is eliminated")]
    PlayerEliminated,
    #[msg("Invalid trade side (must be 1 for long, 2 for short)")]
    InvalidSide,
    #[msg("Invalid leverage (must be 1-50)")]
    InvalidLeverage,
    #[msg("Insufficient funds for margin")]
    InsufficientFunds,
    #[msg("Cannot finalize round yet")]
    CannotFinalizeYet,
    #[msg("Transfer failed")]
    TransferFailed,
}
