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
      console.error("[IPFS] Credential storage configuration is missing.");
      return NextResponse.json(
        {
          error: "Credential storage is not available. Please contact the site administrator.",
        },
        { status: 503 }
      );
    }

    console.error("[IPFS] Credential upload failed:", error);
    return NextResponse.json(
      { error: "Credential storage is temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
