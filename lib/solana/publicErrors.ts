type TransactionAction = "issue" | "revoke";

function collectErrorText(error: unknown): string {
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): string[] => {
    if (depth > 5 || value == null) return [];
    if (typeof value === "string") return [value];
    if (typeof value === "number" || typeof value === "boolean") return [String(value)];
    if (typeof value !== "object" || seen.has(value)) return [];
    seen.add(value);

    if (Array.isArray(value)) return value.flatMap((entry) => visit(entry, depth + 1));
    const record = value as Record<string, unknown>;
    return ["message", "code", "logs", "cause", "data", "error", "transactionError", "name"]
      .flatMap((key) => visit(record[key], depth + 1));
  };

  return visit(error, 0).join(" ").toLowerCase();
}

export function getPublicTransactionError(error: unknown, action: TransactionAction): string {
  const details = collectErrorText(error);

  if (/user rejected|rejected by user|user denied|transaction cancelled|transaction canceled/.test(details)) {
    return action === "issue"
      ? "The transaction was cancelled in your wallet. Check Recent Activity to confirm whether an earlier step completed."
      : "The transaction was cancelled in your wallet. The credential was not revoked.";
  }
  if (/insufficient funds|insufficient lamports|insufficient balance|not enough sol|attempt to debit an account but found no record/.test(details)) {
    return "This wallet needs more SOL on the selected Solana network to cover the transaction and account storage. Add SOL to this wallet on that network, then try again.";
  }
  if (/429|too many requests|rate limit|blockhash not found|timed? out|timeout|failed to fetch|network error|rpc request/.test(details)) {
    return "The Solana network is temporarily unavailable. Check your connection and try again. If you approved a transaction, check recent activity before retrying.";
  }
  if (action === "issue" && /already in use|already exists|already been processed/.test(details)) {
    return "This credential may already have been issued. Check Recent Activity before trying again.";
  }
  if (action === "revoke" && /unauthorizedissuer|has_one|constraint has_one/.test(details)) {
    return "Only the institution that issued this credential can revoke it.";
  }
  if (action === "revoke" && /accountnotinitialized|account not initialized|account does not exist/.test(details)) {
    return "No credential was found for that hash on the selected Solana network. Check the hash and network, then try again.";
  }
  if (action === "issue" && /storage|pinata|ipfs/.test(details)) {
    return "Credential storage is temporarily unavailable. Please try again later.";
  }

  return action === "issue"
    ? "Credential issuance failed. Check the connected wallet and selected network, then try again. If a transaction may have been submitted, check Recent Activity first."
    : "Credential revocation failed. Check the connected wallet, credential hash, and selected network, then try again. If a transaction may have been submitted, check Audit Logs first.";
}
