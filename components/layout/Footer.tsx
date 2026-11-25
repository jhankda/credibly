"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWalletRole } from "@/lib/solana/useWalletRole";

export function Footer() {
  const role = useWalletRole();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeRole = mounted ? role : "disconnected";
  const workspaceLinks = activeRole === "institution"
    ? [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/issue", label: "Issue Credentials" },
        { href: "/dashboard/logs", label: "Audit Logs" },
        { href: "/wallet", label: "My Wallet" },
      ]
    : activeRole === "student"
      ? [{ href: "/wallet", label: "Student Overview" }]
      : [{ href: "/", label: "About Credibly" }];

  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center"><span className="text-white text-xs font-bold">C</span></div>
              <span className="text-base font-semibold text-gray-900">Credibly</span>
            </div>
            <p className="text-sm text-gray-400 max-w-xs">Trust infrastructure for academic credentials, built on Solana.</p>
          </div>
          <div className="flex gap-16 text-sm">
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider">Workspace</h4>
              {workspaceLinks.map((link) => <Link key={link.href} href={link.href} className="block text-gray-500 hover:text-gray-700">{link.label}</Link>)}
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wider">Public</h4>
              <Link href="/verify" className="block text-gray-500 hover:text-gray-700">Verify a credential</Link>
              <p className="max-w-40 text-xs leading-relaxed text-gray-400">Verification links work without connecting a wallet.</p>
              <a href="https://www.w3.org/TR/vc-data-model/" target="_blank" rel="noreferrer" className="block text-gray-500 hover:text-gray-700">W3C VC specification</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-5 border-t border-gray-100 text-xs text-gray-400">&copy; {new Date().getFullYear()} Credibly.</div>
      </div>
    </footer>
  );
}
