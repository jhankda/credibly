"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { useWalletRole } from "@/lib/solana/useWalletRole";

export function Navbar() {
  const pathname = usePathname();
  const role = useWalletRole();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeRole = mounted ? role : "disconnected";
  const links = activeRole === "institution"
    ? [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/issue", label: "Issue" },
        { href: "/dashboard/revoke", label: "Revoke" },
        { href: "/dashboard/logs", label: "Audit Logs" },
        { href: "/wallet", label: "My Wallet" },
        { href: "/verify", label: "Verify" },
      ]
    : activeRole === "student"
      ? [
          { href: "/wallet", label: "Overview" },
          { href: "/verify", label: "Verify" },
        ]
      : [{ href: "/verify", label: "Verify" }];

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 text-gray-900 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><span className="text-white text-sm font-bold">C</span></div>
          <span className="text-lg font-semibold tracking-tight">Credibly</span>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          {activeRole === "loading" ? (
            <span className="hidden sm:inline text-xs text-gray-400 px-3">Checking wallet…</span>
          ) : links.map((link) => {
            const active = pathname === link.href || (link.href !== "/dashboard" && link.href !== "/wallet" && pathname.startsWith(`${link.href}/`));
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`px-2.5 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${active ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                {link.label}
              </Link>
            );
          })}
        </div>

        <ClientWalletButton className="!bg-gray-900 hover:!bg-gray-800 !text-white !font-medium !rounded-lg !h-9 !text-xs sm:!text-sm !px-3 sm:!px-4 transition-all shrink-0" />
      </div>
    </nav>
  );
}
