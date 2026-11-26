import { NextRequest, NextResponse } from "next/server";
import { verifyCredentialHash } from "@/lib/solana/serverVerification";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ valid: false, exists: false }, { status: 400 });
  }

  const result = await verifyCredentialHash(hash);
  return result
    ? NextResponse.json(result)
    : NextResponse.json({ valid: false, exists: false }, { status: 404 });
}
