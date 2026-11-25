"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { Clock, ExternalLink, RefreshCw } from "lucide-react";
import { useCrediblyProgram } from "@/lib/solana/client";
import { getInstitutionActivity, refreshInstitutionActivity, type InstitutionActivity } from "@/lib/solana/activity";

export default function LogsPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useCrediblyProgram();
  const [logs, setLogs] = useState<InstitutionActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingForNew, setCheckingForNew] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("Loading cached activity…");
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  // Manual trigger handler
  const [manualTrigger, setManualTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    let lastCheckedTime = 0;
    setLogs([]);
    setError("");
    setCheckingForNew(false);
    setUpdateMessage("Waiting for wallet activity…");
    setLastChecked(null);
    if (!publicKey || !program) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    const issuer = publicKey;
    const activeProgram = program;

    const checkForUpdates = async (force = false) => {
      const now = Date.now();
      // Enforce 30s cooldown unless forced by user click
      if (!force && now - lastCheckedTime < 30_000) return;
      lastCheckedTime = now;

      setCheckingForNew(true);
      setUpdateMessage("Checking for new transactions…");
      try {
        const snapshot = await refreshInstitutionActivity(connection, activeProgram, issuer);
        if (!active) return;
        setLogs(snapshot.activity);
        setLastChecked(snapshot.checkedAt);
        setUpdateMessage(snapshot.foundNewActivity ? "New transaction found. Activity list updated." : "No new transactions since the last check.");
        setError("");
      } catch (cause) {
        if (!active) return;
        setUpdateMessage("Could not check for new transactions. Showing cached activity.");
        setError("The network is busy. Cached activity will remain visible while we retry later.");
      } finally {
        if (active) setCheckingForNew(false);
      }
    };

    getInstitutionActivity(connection, activeProgram, issuer, 15)
      .then((snapshot) => {
        if (!active) return;
        setLogs(snapshot.activity);
        setLastChecked(snapshot.checkedAt);
        lastCheckedTime = snapshot.checkedAt;
        setLoading(false);
        setUpdateMessage("Activity loaded. Checking for new transactions periodically.");
      })
      .catch((cause: unknown) => {
        if (active) {
          setError("Could not refresh activity right now. Cached activity will be used if available.");
          setUpdateMessage("RPC is currently busy. Displaying cached records.");
          setLoading(false);
        }
      })
      .finally(() => { if (active) setLoading(false); });

    // Poll every 60s
    const interval = window.setInterval(() => { void checkForUpdates(false); }, 60_000);

    // On tab visibility change, recheck if cooldown elapsed
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdates(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [connection, publicKey, program, manualTrigger]);

  const handleManualRefresh = () => {
    if (checkingForNew || loading) return;
    setManualTrigger((prev) => prev + 1);
  };

  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Audit Logs</h1>
          <p className="text-sm text-gray-500">Credential actions submitted by the connected institution wallet.</p>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={loading || checkingForNew || !publicKey}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh audit logs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checkingForNew || loading ? "animate-spin text-blue-600" : "text-gray-500"}`} />
          <span>{checkingForNew ? "Checking…" : "Refresh"}</span>
        </button>
      </motion.div>

      <section aria-live="polite" className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold text-blue-900">Activity updates</h2>
          <p className="text-xs text-blue-800 mt-1">{loading || checkingForNew ? "Checking for new transactions…" : updateMessage}</p>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${checkingForNew || loading ? "bg-blue-500 animate-pulse" : error ? "bg-amber-500" : "bg-emerald-500"}`} />
        {lastChecked && !checkingForNew && <time className="text-[10px] text-blue-700 shrink-0">Checked {new Date(lastChecked).toLocaleTimeString()}</time>}
      </section>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-2.5 grid grid-cols-12 gap-3 text-[11px] tracking-wider uppercase font-semibold text-gray-400">
          <div className="col-span-5">Action / Credential</div>
          <div className="col-span-4">Timestamp</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : !publicKey ? (
          <div className="p-10 text-center text-sm text-gray-400">Connect the institution wallet to see its audit log.</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">{error ? "Could not load transactions from the RPC." : "No credential transactions found for this wallet."}</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {logs.map((log, index) => (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.01 }} key={log.signature} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-gray-50/50">
                <div className="col-span-5 min-w-0">
                  <div className="text-xs font-medium text-gray-800">{log.action}</div>
                  {log.credentialHash && <div className="font-mono text-[10px] text-gray-500 truncate mt-1">{log.credentialHash}</div>}
                  <div className="font-mono text-[10px] text-gray-400 truncate mt-1">{log.signature}</div>
                </div>
                <div className="col-span-4 text-gray-500 text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                  {log.blockTime ? new Date(log.blockTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Pending"}
                </div>
                <div className="col-span-2 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${log.failed ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{log.failed ? "Failed" : "Confirmed"}</span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <a href={`https://explorer.solana.com/tx/${log.signature}?cluster=${cluster}`} target="_blank" rel="noreferrer" aria-label="Open transaction on Solana Explorer" className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"><ExternalLink className="w-3.5 h-3.5" /></a>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
