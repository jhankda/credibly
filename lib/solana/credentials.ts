import { Program, web3 } from "@coral-xyz/anchor";
import type { Credibly } from "./idl/credibly";
import { getCredentialPDA } from "./client";
import { invalidateWalletRole } from "./useWalletRole";
import type { VerifiableCredential } from "@/lib/ipfs/upload";

export async function issueCredentialOnChain(
  program: Program<Credibly>,
  issuer: web3.PublicKey,
  vc: VerifiableCredential
): Promise<{ txSig: string; credentialHash: string; ipfsCID: string }> {
  // Step 1: Upload to IPFS via server-side API route (Pinata keys are server-only)
  const res = await fetch("/api/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vc }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IPFS upload failed: ${err}`);
  }

  const { ipfsCID, credentialHashHex } = await res.json();
  const credentialHash = Buffer.from(credentialHashHex, "hex");

  const [institutionAccount] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("institution"), issuer.toBuffer()],
    program.programId
  );

  // The on-chain issue instruction requires the issuer to be in the trust
  // registry. Register this wallet on first use; the wallet signs and pays.
  const existingInstitution = await program.provider.connection.getAccountInfo(
    institutionAccount,
    "confirmed"
  );
  if (!existingInstitution) {
    const institutionName =
      typeof vc.credentialSubject.institution === "string"
        ? vc.credentialSubject.institution
        : "Credibly Institution";
    await program.methods
      .registerInstitution(
        institutionName,
        2,
        `did:sol:${issuer.toBase58()}`
      )
      .accounts({ institution: issuer, authority: issuer })
      .rpc();
    invalidateWalletRole(issuer.toBase58());
  }

  // Step 2: Submit on-chain tx from the browser wallet
  let txSig: string;
  try {
    txSig = await program.methods
      .issueCredential(
        Array.from(credentialHash),
        ipfsCID,
        vc.credentialSubject.id
      )
      .accounts({ issuer })
      .rpc();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already been processed")) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Transaction was confirmed but RPC reported it as already processed. Treating it as success.");
      }
      // We don't have the exact txSig unfortunately since it errored, but we know it succeeded
      txSig = "already_processed_check_explorer";
    } else {
      throw err;
    }
  }

  return { txSig, credentialHash: credentialHashHex, ipfsCID };
}

export async function verifyCredentialOnChain(
  program: Program<Credibly>,
  credentialHash: Buffer
) {
  const [credentialPDA] = getCredentialPDA(credentialHash);
  try {
    const account = await program.account.credentialAccount.fetch(credentialPDA);
    return {
      valid: !account.revoked,
      exists: true,
      issuer: account.issuer.toBase58(),
      holderDid: account.holderDid,
      ipfsCid: account.ipfsCid,
      issuedAt: new Date(account.issuedAt.toNumber() * 1000).toISOString(),
      revoked: account.revoked,
    };
  } catch {
    return { valid: false, exists: false };
  }
}
