"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWalletRole } from "@/lib/solana/useWalletRole";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = useWalletRole();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (role === "student") router.replace("/wallet");
    else if (role === "disconnected") router.replace("/");
  }, [pathname, role, router]);

  if (role !== "institution") {
    return (
      <main className="flex-1 grid place-items-center bg-gray-50/50 p-8 text-center">
        <p className="max-w-md text-sm text-gray-500">
          {role === "unknown" ? "Could not check this wallet’s institution status. Check the network connection and try again." : "Opening the workspace for this wallet…"}
        </p>
      </main>
    );
  }

  return <main className="flex-1 bg-gray-50/50">{children}</main>;
}
