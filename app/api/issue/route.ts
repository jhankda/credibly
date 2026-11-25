import { NextRequest, NextResponse } from "next/server";
import { uploadCredentialToIPFS, hashVC } from "@/lib/ipfs/upload";

export async function POST(req: NextRequest) {
  let body: { vc?: Parameters<typeof hashVC>[0] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.vc || typeof body.vc !== "object") {
    return NextResponse.json({ error: "Request must include a credential object in `vc`." }, { status: 400 });
  }

  try {
    const ipfsCID = await uploadCredentialToIPFS(body.vc);
    const credentialHashHex = hashVC(body.vc).toString("hex");

    // Client receives the hash + CID, then signs and submits the tx from their wallet
    return NextResponse.json({ ipfsCID, credentialHashHex });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    if (message.startsWith("Missing required environment variable:")) {
      return NextResponse.json(
        {
          error: "IPFS upload is not configured. Set PINATA_API_KEY and PINATA_SECRET in .env.local, then restart the dev server.",
        },
        { status: 503 }
      );
    }

    console.error("[IPFS] Credential upload failed:", message);
    return NextResponse.json(
      { error: `Pinata upload failed: ${message}` },
      { status: 502 }
    );
  }
}
