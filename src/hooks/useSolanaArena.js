import { useMemo } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import idl from '../idl.json';

// Make sure to match the Program ID deployed
const PROGRAM_ID = new PublicKey(idl.address || "FLDK6cFtbf15bd88aVGYmWsGd4btFzyUuJjwV2urpw4y");

export function useSolanaArena() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const provider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!connection) return null;

        // Create a read-only provider for public data when wallet is not connected
        if (!wallet) {
            try {
                const readonlyProvider = new AnchorProvider(
                    connection,
                    {
                        publicKey: PublicKey.default,
                        signTransaction: async (t) => t,
                        signAllTransactions: async (t) => t
                    },
                    { commitment: 'confirmed' }
                );
                return new Program(idl, readonlyProvider);
            } catch (e) {
                console.error("Failed to create read-only program:", e);
                return null;
            }
        }
        return new Program(idl, provider);
    }, [connection, provider, wallet]);

    return {
        program,
        provider,
        connection,
        wallet,
        programId: PROGRAM_ID
    };
}
