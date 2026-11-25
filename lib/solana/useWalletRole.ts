"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getInstitutionPDA, useCrediblyProgram } from "@/lib/solana/client";

export type WalletRole = "institution" | "student" | "disconnected" | "loading" | "unknown";

const ROLE_CACHE_MS = 300_000; // 5 minutes cache
const roleCache = new Map<string, { role: "institution" | "student"; checkedAt: number }>();
const roleRequests = new Map<string, Promise<"institution" | "student">>();

export function invalidateWalletRole(address: string) {
  for (const key of roleCache.keys()) {
    if (key.endsWith(`:${address}`)) roleCache.delete(key);
  }
  for (const key of roleRequests.keys()) {
    if (key.endsWith(`:${address}`)) roleRequests.delete(key);
  }
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(`credibly:role:${address}`);
    } catch {}
    window.dispatchEvent(new CustomEvent("credibly:wallet-role-changed", { detail: address }));
  }
}

async function resolveWalletRole(
  address: string,
  publicKey: NonNullable<ReturnType<typeof useWallet>["publicKey"]>,
  program: NonNullable<ReturnType<typeof useCrediblyProgram>>
): Promise<"institution" | "student"> {
  const key = `${program.provider.connection.rpcEndpoint}:${program.programId.toBase58()}:${address}`;
  const cached = roleCache.get(key);
  if (cached && Date.now() - cached.checkedAt < ROLE_CACHE_MS) return cached.role;

  if (typeof window !== "undefined") {
    try {
      const stored = window.sessionStorage.getItem(`credibly:role:${address}`);
      if (stored === "institution" || stored === "student") {
        roleCache.set(key, { role: stored, checkedAt: Date.now() });
        return stored;
      }
    } catch {}
  }

  const activeRequest = roleRequests.get(key);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const [institutionPda] = getInstitutionPDA(publicKey);
    const institution = await program.account.institutionAccount.fetchNullable(institutionPda);
    const role: "institution" | "student" = institution ? "institution" : "student";
    roleCache.set(key, { role, checkedAt: Date.now() });
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(`credibly:role:${address}`, role);
      } catch {}
    }
    return role;
  })().finally(() => roleRequests.delete(key));

  roleRequests.set(key, request);
  return request;
}

export function useWalletRole(): WalletRole {
  const { publicKey, connecting } = useWallet();
  const program = useCrediblyProgram();
  const address = publicKey?.toBase58() ?? null;

  const [state, setState] = useState<{ address: string | null; role: WalletRole }>({
    address: null,
    role: "disconnected",
  });

  useEffect(() => {
    let current = true;
    let retryTimer: number | undefined;
    let retryAttempt = 0;

    if (!address || !publicKey) {
      const hasStoredWallet = typeof window !== "undefined" && Boolean(window.localStorage.getItem("walletName"));
      if (connecting || hasStoredWallet) {
        setState({ address: null, role: "loading" });
      } else {
        setState({ address: null, role: "disconnected" });
      }
      return () => { current = false; };
    }

    // Check fast session cache first
    let hasFastCached = false;
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem(`credibly:role:${address}`);
        if (stored === "institution" || stored === "student") {
          hasFastCached = true;
          setState({ address, role: stored });
        }
      } catch {}
    }

    if (!hasFastCached) {
      setState({ address, role: "loading" });
    }

    if (!program) return () => { current = false; };

    const connectedKey = publicKey;
    const activeProgram = program;

    const resolve = () => resolveWalletRole(address, connectedKey, activeProgram)
      .then((role) => {
        retryAttempt = 0;
        if (current) setState({ address, role });
      })
      .catch(() => {
        if (!current) return;
        // Keep cached role if available; only report unknown if completely unresolved
        setState((prev) => {
          if (prev.address === address && (prev.role === "institution" || prev.role === "student")) {
            return prev;
          }
          return { address, role: "unknown" };
        });
        const delay = Math.min(2_000 * (2 ** retryAttempt), 15_000);
        retryAttempt += 1;
        retryTimer = window.setTimeout(() => {
          if (current) {
            void resolve();
          }
        }, delay);
      });

    const onRoleChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== address) return;
      for (const key of roleCache.keys()) {
        if (key.endsWith(`:${address}`)) roleCache.delete(key);
      }
      for (const key of roleRequests.keys()) {
        if (key.endsWith(`:${address}`)) roleRequests.delete(key);
      }
      if (current) setState({ address, role: "loading" });
      void resolve();
    };

    window.addEventListener("credibly:wallet-role-changed", onRoleChanged);
    void resolve();

    return () => {
      current = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener("credibly:wallet-role-changed", onRoleChanged);
    };
  }, [address, connecting, program, publicKey]);

  if (state.address !== address) {
    return address ? "loading" : state.role;
  }
  return state.role;
}
