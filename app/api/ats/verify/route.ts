import { NextRequest, NextResponse } from "next/server";
import { verifyCredentialHash } from "@/lib/solana/serverVerification";

export async function POST(req: NextRequest) {
  let body: { credentialHash?: unknown; atsSource?: string; candidateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = typeof body.credentialHash === "string"
      ? await verifyCredentialHash(body.credentialHash)
      : null;
    return NextResponse.json({
      candidate_verified: result?.valid ?? false,
      candidate_id: body.candidateId,
      issuer: result?.issuer,
      issuer_tier: undefined,
      verified_at: new Date().toISOString(),
      explorer_url: result
        ? `https://explorer.solana.com/address/${result.credentialPDA}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet"}`
        : undefined,
      source: body.atsSource,
    });
  } catch (error) {
    console.error("[ATS] Credential verification failed:", error);
    return NextResponse.json(
      { error: "Credential verification is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
}
