"use client";
import { useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

const connectionConfig = {
  commitment: "confirmed" as const,
};

type PhantomProvider = {
  publicKey?: { toBase58(): string } | null;
  on?: (event: "accountChanged", listener: (publicKey: { toBase58(): string } | null) => void) => void;
  off?: (event: "accountChanged", listener: (publicKey: { toBase58(): string } | null) => void) => void;
};

function PhantomAccountChangeFallback() {
  const { publicKey } = useWallet();

  useEffect(() => {
    let reloadTimer: number | undefined;
    const checkAccount = (eventAddress?: string | null) => {
      const phantom = (window as Window & { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
      const nextAddress = eventAddress ?? phantom?.publicKey?.toBase58() ?? null;
      if (!nextAddress || nextAddress === publicKey?.toBase58()) return;

      // Wallet Standard should update the adapter first. Reload only as a
      // fallback if the adapter still exposes the old Phantom account.
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        const currentPhantomAddress = phantom?.publicKey?.toBase58() ?? nextAddress;
        if (currentPhantomAddress !== publicKey?.toBase58()) window.location.reload();
      }, 750);
    };
    const phantom = (window as Window & { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
    const onAccountChanged = (key: { toBase58(): string } | null) => checkAccount(key?.toBase58() ?? null);
    const onFocus = () => checkAccount();

    phantom?.on?.("accountChanged", onAccountChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      phantom?.off?.("accountChanged", onAccountChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [publicKey]);

  return null;
}

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      {/* Phantom and Solflare register through Wallet Standard. The provider
          discovers them automatically; adding legacy adapters duplicates them. */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          {mounted && <PhantomAccountChangeFallback />}
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
