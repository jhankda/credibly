"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);
import Link from "next/link";
import { motion } from "framer-motion";
import { QrCode, GraduationCap, Building2, Calendar, Fingerprint, Copy, Check } from "lucide-react";

interface StoredCredential {
  id: string;
  degree: string;
  institution: string;
  issuedAt: string;
  credentialHashHex: string;
  marks?: string;
  revoked?: boolean;
}

export default function WalletPage() {
  const { publicKey } = useWallet();
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAddress, setLoadedAddress] = useState("");
  const [loadError, setLoadError] = useState("");
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("Waiting for a wallet connection.");
  const [copied, setCopied] = useState(false);

  const handleCopyDid = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(`did:sol:${publicKey.toBase58()}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!publicKey) {
      setCredentials([]);
      setLoadedAddress("");
      setLoadError("");
      setUpdateMessage("Connect a wallet to check for credentials.");
      setLoading(false);
      return;
    }

    const address = publicKey.toBase58();
    const cacheKey = `credibly-student-credentials:${address}`;
    const controller = new AbortController();
    let requestInProgress = false;
    let latestCredentials: StoredCredential[] = [];
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) latestCredentials = JSON.parse(cached) as StoredCredential[];
    } catch {
      latestCredentials = [];
    }
    setCredentials(latestCredentials);
    setLoadedAddress(address);
    setLoading(latestCredentials.length === 0);
    setLoadError("");
    setUpdateMessage("Checking for new credentials…");

    const checkForUpdates = async () => {
      if (requestInProgress) return;
      requestInProgress = true;
      setCheckingForUpdates(true);
      try {
        const response = await fetch(`/api/wallet/${address}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not load credentials from Solana.");
        const { credentials: freshCredentials } = await response.json() as { credentials: StoredCredential[] };
        if (controller.signal.aborted) return;
        const knownHashes = new Set(latestCredentials.map(({ credentialHashHex }) => credentialHashHex));
        const newCount = freshCredentials.filter(({ credentialHashHex }) => !knownHashes.has(credentialHashHex)).length;
        latestCredentials = freshCredentials;
        setCredentials(freshCredentials);
        setLoadedAddress(address);
        setLoadError("");
        setUpdateMessage(newCount ? `${newCount} new credential${newCount === 1 ? "" : "s"} found.` : "No new credentials since the last check.");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(freshCredentials)); } catch { /* Cache is optional. */ }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError("Could not refresh credentials right now. Please check your connection and try again.");
        setUpdateMessage("Could not check for new credentials. Showing cached wallet data where available.");
        setLoadedAddress(address);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setCheckingForUpdates(false);
        }
        requestInProgress = false;
      }
    };

    void checkForUpdates();
    const interval = window.setInterval(() => { void checkForUpdates(); }, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") void checkForUpdates(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [publicKey]);

  if (loading || (publicKey && loadedAddress !== publicKey.toBase58())) {
    return <div className="flex-1 grid place-items-center text-sm text-gray-500">Loading wallet credentials…</div>;
  }

  if (!publicKey) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm">
        <div className="w-14 h-14 bg-blue-50 rounded-xl mx-auto mb-4 flex items-center justify-center">
          <Fingerprint className="w-7 h-7 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Identity Wallet</h1>
        <p className="text-sm text-gray-500 mb-5">Connect your Solana wallet to view your credentials.</p>
        <div className="flex justify-center">
          <WalletMultiButton className="!bg-gray-900 !text-white hover:!bg-gray-800 !rounded-lg !font-medium !text-sm" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Student Overview</h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-mono text-gray-600">
            <span className="text-gray-400">DID:</span> did:sol:{publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-6)}
            <button onClick={handleCopyDid} className="ml-1 text-gray-400 hover:text-gray-600 transition-colors" title="Copy full DID">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <section aria-live="polite" className="mb-5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold text-blue-900">Wallet updates</h2>
          <p className="text-xs text-blue-800 mt-1">{checkingForUpdates ? "Checking for new credentials…" : updateMessage}</p>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${checkingForUpdates ? "bg-blue-500 animate-pulse" : loadError ? "bg-amber-500" : "bg-emerald-500"}`} />
      </section>

      {credentials.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-gray-200 text-center py-20 px-6">
          <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-900 mb-1">{loadError ? "Could Not Load Credentials" : "No Credentials Yet"}</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">{loadError || "Credentials issued to this wallet will appear here."}</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {credentials.map((cred, i) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              key={cred.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all"
            >
              <div className="flex justify-between items-start mb-5">
                <div className="w-9 h-9 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-gray-600" />
                </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cred.revoked ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                  {cred.revoked ? "Revoked" : "On-chain"}
                </span>
              </div>

              <h2 className="text-base font-semibold text-gray-900 mb-2">{cred.degree}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Building2 className="w-3.5 h-3.5 text-gray-400" /> {cred.institution}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(cred.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                {cred.marks && (
                  <>
                    <span className="mx-1">•</span>
                    <span className="font-medium text-gray-600">Score: {cred.marks}</span>
                  </>
                )}
              </div>

              <Link href={`/wallet/share/${cred.credentialHashHex}`} className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg transition-colors">
                <QrCode className="w-4 h-4" /> Share via QR
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
