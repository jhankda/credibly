import { NextRequest, NextResponse } from "next/server";
import { verifyCredentialHash } from "@/lib/solana/serverVerification";

export async function POST(req: NextRequest) {
  const { credentialHash, atsSource, candidateId } = await req.json();
  const result = typeof credentialHash === "string"
    ? await verifyCredentialHash(credentialHash)
    : null;

  return NextResponse.json({
    candidate_verified: result?.valid ?? false,
    candidate_id: candidateId,
    issuer: result?.issuer,
    issuer_tier: undefined,
    verified_at: new Date().toISOString(),
    explorer_url: result
      ? `https://explorer.solana.com/address/${result.credentialPDA}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet"}`
      : undefined,
    source: atsSource,
  });
}
