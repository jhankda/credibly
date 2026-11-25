import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { QueryProvider } from "@/components/QueryProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans-apply" });

export const metadata: Metadata = {
  title: "Credibly — Trusted Academic Credentials",
  description: "Secure, tamper-proof academic verification powered by Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen">
        <QueryProvider>
          <WalletProviders>
            <Navbar />

            <main className="flex-1 flex flex-col">{children}</main>

            <Footer />
          </WalletProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
