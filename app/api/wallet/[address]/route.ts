import { AnchorProvider, Program, utils } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import idl from "@/lib/solana/idl/credibly.json";
import type { Credibly } from "@/lib/solana/idl/credibly";

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "HYLVH9iBUSroAyDViFn6fY7WirfPuv1kG89TCyvAz5fx"
);

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  let holderDid: string;
  try {
    holderDid = `did:sol:${new PublicKey(address).toBase58()}`;
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet address." }, { status: 400 });
  }

  try {
    const provider = new AnchorProvider(connection, {} as never, { commitment: "confirmed" });
    const program = new Program<Credibly>({ ...idl, address: PROGRAM_ID.toBase58() } as Credibly, provider);
    const holderBytes = Buffer.from(holderDid, "utf8");
    const encodedLength = Buffer.alloc(4);
    encodedLength.writeUInt32LE(holderBytes.length);
    const accounts = await program.account.credentialAccount.all([
      { memcmp: { offset: 72, bytes: utils.bytes.bs58.encode(encodedLength) } },
      { memcmp: { offset: 76, bytes: utils.bytes.bs58.encode(holderBytes) } },
    ]);
    const credentials = await Promise.all(
      accounts.map(async ({ account }) => {
          let details: { degree?: string; institution?: string; marks?: string } = {};
          const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
          try {
            const response = await fetch(`${gateway}/${account.ipfsCid}`, { cache: "no-store" });
            if (response.ok) {
              const vc = await response.json();
              details = {
                degree: typeof vc.credentialSubject?.degree === "string" ? vc.credentialSubject.degree : undefined,
                institution:
                  typeof vc.credentialSubject?.institution === "string"
                    ? vc.credentialSubject.institution
                    : undefined,
                marks: typeof vc.credentialSubject?.marks === "string" ? vc.credentialSubject.marks : undefined,
              };
            }
          } catch {
            // Keep the on-chain credential visible even when its IPFS details are unavailable.
          }

          return {
            id: Buffer.from(account.credentialHash).toString("hex"),
            credentialHashHex: Buffer.from(account.credentialHash).toString("hex"),
            degree: details.degree || "Academic Credential",
            institution: details.institution || "Institution details unavailable",
            marks: details.marks,
            issuedAt: new Date(account.issuedAt.toNumber() * 1000).toISOString(),
            ipfsCid: account.ipfsCid,
            revoked: account.revoked,
          };
        })
    );

    return NextResponse.json(
      { credentials },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[Wallet] Failed to load on-chain credentials:", error);
    return NextResponse.json({ error: "Could not load credentials from Solana." }, { status: 502 });
  }
}
