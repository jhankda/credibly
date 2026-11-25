"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Shield } from "lucide-react";
import { getInstitutionPDA, useCrediblyProgram } from "@/lib/solana/client";
import { getInstitutionActivity, type InstitutionActivity } from "@/lib/solana/activity";

interface OverviewData {
  issued: number;
  active: number;
  revoked: number;
  tier: number | null;
  institutionName: string;
}

const emptyOverview: OverviewData = { issued: 0, active: 0, revoked: 0, tier: null, institutionName: "" };

export default function DashboardOverview() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useCrediblyProgram();
  const [overview, setOverview] = useState(emptyOverview);
  const [recentActivity, setRecentActivity] = useState<InstitutionActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    setOverview(emptyOverview);
    setRecentActivity([]);
    setLoadError("");

    if (!publicKey || !program) {
      setLoading(false);
      return () => { active = false; };
    }

    const issuer = publicKey;
    const activeProgram = program;
    setLoading(true);
    async function loadOverview() {
      try {
        const [allCredentials, institution, activity] = await Promise.all([
          activeProgram.account.credentialAccount.all([
            { memcmp: { offset: 40, bytes: issuer.toBase58() } },
          ]),
          (async () => {
            const [pda] = getInstitutionPDA(issuer);
            try {
              return await activeProgram.account.institutionAccount.fetchNullable(pda);
            } catch {
              return null;
            }
          })(),
          getInstitutionActivity(connection, activeProgram, issuer, 5).catch(() => null),
        ]);

        const credentials = allCredentials.filter(({ account }) => account.issuer.equals(issuer));
        if (!active) return;
        setOverview({
          issued: credentials.length,
          active: credentials.filter(({ account }) => !account.revoked).length,
          revoked: credentials.filter(({ account }) => account.revoked).length,
          tier: institution?.tier ?? null,
          institutionName: institution?.name ?? "",
        });
        setRecentActivity(activity?.activity.slice(0, 5) ?? []);
      } catch (error) {
        if (active) setLoadError("Could not load this wallet’s on-chain overview. The RPC may be busy; cached activity is still available in Audit Logs.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOverview();
    return () => { active = false; };
  }, [connection, publicKey, program]);

  const metrics = [
    { title: "Credentials Issued", value: overview.issued, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Active Credentials", value: overview.active, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Revoked Credentials", value: overview.revoked, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
    { title: "Trust Tier", value: overview.tier ? `Tier ${overview.tier}` : "Unregistered", icon: Shield, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Institution Overview</h1>
        <p className="text-sm text-gray-500">Credential totals and recent on-chain actions for this wallet.</p>
        {publicKey ? (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-mono text-emerald-800 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {overview.institutionName ? `${overview.institutionName} · ` : ""}
            {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
          </div>
        ) : (
          <div className="mt-4 text-sm text-gray-500">Connect an institution wallet to view its activity.</div>
        )}
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <motion.div key={metric.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${metric.bg} flex items-center justify-center mb-3`}>
              <metric.icon className={`w-4 h-4 ${metric.color}`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{loading ? "—" : metric.value}</div>
            <p className="text-xs text-gray-500 mt-1 font-medium">{metric.title}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <section className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/dashboard/logs" className="text-[11px] text-gray-500 hover:text-gray-900 bg-gray-50 px-2 py-1 rounded">View all</Link>
          </div>
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">Loading on-chain activity…</div>
          ) : loadError ? (
            <div className="py-8 text-center text-xs text-red-500">{loadError}</div>
          ) : !publicKey ? (
            <div className="py-8 text-center text-xs text-gray-400">Connect your institution wallet to view its activity.</div>
          ) : recentActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">No credential activity found for this wallet.</div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.signature} className="flex justify-between items-center p-3 rounded-lg border border-gray-100 gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800">{item.action}{item.failed ? " · Failed" : ""}</div>
                    {item.credentialHash && <div className="font-mono text-[10px] text-gray-400 truncate mt-1">{item.credentialHash}</div>}
                    <div className="font-mono text-[10px] text-gray-400 truncate mt-1">{item.signature}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400">{item.blockTime ? new Date(item.blockTime * 1000).toLocaleString() : "Pending"}</span>
                    <a href={`https://explorer.solana.com/tx/${item.signature}?cluster=devnet`} target="_blank" rel="noreferrer" aria-label="View transaction" className="text-emerald-600"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm h-fit">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1.5"><Shield className="w-4 h-4 text-emerald-600" /> Trust Registry</h2>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
            <p className="text-xs text-emerald-800/80 mb-1 font-medium uppercase tracking-wider">On-chain status</p>
            <h3 className="text-lg font-bold text-emerald-900 mb-2">{overview.tier ? `Tier ${overview.tier}` : "Not registered"}</h3>
            <p className="text-xs text-emerald-800/70 leading-relaxed">
              {overview.tier ? "Tier shown from this wallet’s institution account on Solana." : "This wallet has no registered institution account."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
