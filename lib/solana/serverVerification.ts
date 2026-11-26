import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";
import idl from "@/lib/solana/idl/credibly.json";
import type { Credibly } from "@/lib/solana/idl/credibly";

const connection = new web3.Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  { commitment: "confirmed" }
);
const programId = new web3.PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "HYLVH9iBUSroAyDViFn6fY7WirfPuv1kG89TCyvAz5fx"
);

export interface CredentialVerificationResult {
  valid: boolean;
  exists: true;
  issuer: string;
  holderDid: string;
  ipfsCid: string;
  issuedAt: string;
  revoked: boolean;
  credentialPDA: string;
}

export async function verifyCredentialHash(
  hash: string
): Promise<CredentialVerificationResult | null> {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return null;

  const hashBytes = Buffer.from(hash, "hex");
  const [credentialPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), hashBytes],
    programId
  );
  const provider = new AnchorProvider(connection, {} as never, { commitment: "confirmed" });
  const program = new Program<Credibly>(idl as Credibly, provider);

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
      credentialPDA: credentialPDA.toBase58(),
    };
  } catch {
    return null;
  }
}
