import { web3, type Program } from "@coral-xyz/anchor";
import type { Credibly } from "./idl/credibly";

export interface InstitutionActivity {
  signature: string;
  blockTime: number | null;
  failed: boolean;
  action: string;
  credentialHash?: string;
}

export interface ActivitySnapshot {
  activity: InstitutionActivity[];
  checkedAt: number;
  foundNewActivity: boolean;
}

const MAX_ACTIVITY = 10;
const CACHE_TTL_MS = 60_000; // 1 minute snapshot freshness
const TX_CACHE_PREFIX = "credibly_tx_v2:";
const SNAPSHOT_CACHE_PREFIX = "credibly_activity_snapshot_v2:";

// In-memory caches for fast lookup and SSR support
const snapshotCache = new Map<string, ActivitySnapshot & { latestSignature: string | null }>();
const transactionCache = new Map<string, InstitutionActivity | null>();
const pendingRequests = new Map<string, Promise<ActivitySnapshot & { latestSignature: string | null }>>();
const rpcConnections = new Map<string, web3.Connection>();

function getReadConnection(connection: web3.Connection): web3.Connection {
  let readConnection = rpcConnections.get(connection.rpcEndpoint);
  if (!readConnection) {
    readConnection = new web3.Connection(connection.rpcEndpoint, {
      commitment: "confirmed",
    });
    rpcConnections.set(connection.rpcEndpoint, readConnection);
  }
  return readConnection;
}

function cacheKey(connection: web3.Connection, program: Program<Credibly>, issuer: web3.PublicKey): string {
  return `${SNAPSHOT_CACHE_PREFIX}${connection.rpcEndpoint}:${program.programId.toBase58()}:${issuer.toBase58()}`;
}

/**
 * Exponential backoff helper for rate-limited RPC requests (429 Too Many Requests).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 600
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("too many requests") ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("specific rpc call");

      if (attempt < retries && isRateLimit) {
        attempt++;
        const jitter = Math.floor(Math.random() * 250);
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Retrieve cached parsed transaction (immutable once confirmed on-chain).
 */
function getCachedTransaction(signature: string): InstitutionActivity | null | undefined {
  if (transactionCache.has(signature)) {
    return transactionCache.get(signature);
  }
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(TX_CACHE_PREFIX + signature);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as InstitutionActivity | null;
    transactionCache.set(signature, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Save parsed transaction to permanent cache.
 */
function setCachedTransaction(signature: string, activity: InstitutionActivity | null) {
  transactionCache.set(signature, activity);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TX_CACHE_PREFIX + signature, JSON.stringify(activity));
    } catch {
      // Storage might be full; in-memory cache remains active
    }
  }
}

function getCachedSnapshot(key: string): (ActivitySnapshot & { latestSignature: string | null }) | undefined {
  const current = snapshotCache.get(key);
  if (current) return current;
  if (typeof window === "undefined") return undefined;

  try {
    const saved = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
    if (!saved) return undefined;
    const parsed = JSON.parse(saved) as ActivitySnapshot & { latestSignature: string | null };
    snapshotCache.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function setCachedSnapshot(key: string, snapshot: ActivitySnapshot & { latestSignature: string | null }) {
  snapshotCache.set(key, snapshot);
  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(snapshot);
      window.sessionStorage.setItem(key, serialized);
      window.localStorage.setItem(key, serialized);
    } catch {
      // In-memory cache continues to serve data
    }
  }
}

/**
 * Optimistically records a newly submitted on-chain transaction (e.g. immediately after issuing or revoking).
 * This eliminates unnecessary RPC calls and provides instant UI updates.
 */
export function recordOptimisticActivity(
  issuer: web3.PublicKey,
  activityItem: InstitutionActivity
) {
  setCachedTransaction(activityItem.signature, activityItem);

  // Update all matching snapshot caches in memory & storage
  const issuerPrefix = issuer.toBase58();
  for (const [key, snapshot] of snapshotCache.entries()) {
    if (key.includes(issuerPrefix)) {
      const filtered = snapshot.activity.filter((a) => a.signature !== activityItem.signature);
      const updatedList = [activityItem, ...filtered].slice(0, MAX_ACTIVITY);
      const updatedSnapshot = {
        activity: updatedList,
        checkedAt: Date.now(),
        foundNewActivity: true,
        latestSignature: activityItem.signature,
      };
      setCachedSnapshot(key, updatedSnapshot);
    }
  }
}

/**
 * Parses a single transaction safely using individual getParsedTransaction with retry.
 * Avoids JSON-RPC batching (_rpcBatchRequest) which triggers 429 "Too many requests for a specific RPC call".
 */
async function parseTransaction(
  readConnection: web3.Connection,
  program: Program<Credibly>,
  signatureInfo: { signature: string; blockTime?: number | null; err?: unknown }
): Promise<InstitutionActivity | null> {
  const sig = signatureInfo.signature;
  const cached = getCachedTransaction(sig);
  if (cached !== undefined) {
    return cached;
  }

  const decoder = program.coder.instruction as unknown as {
    decode(data: string, encoding: "base58"): { name: string; data: unknown } | null;
  };

  try {
    const tx = await withRetry(() =>
      readConnection.getParsedTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
    );

    if (!tx) {
      setCachedTransaction(sig, null);
      return null;
    }

    const instruction = tx.transaction.message.instructions.find(
      (candidate) => candidate.programId.equals(program.programId) && "data" in candidate
    );

    if (!instruction || !("data" in instruction)) {
      setCachedTransaction(sig, null);
      return null;
    }

    const decoded = decoder.decode(instruction.data, "base58");
    if (!decoded) {
      setCachedTransaction(sig, null);
      return null;
    }

    const names: Record<string, string> = {
      issueCredential: "Credential issued",
      issue_credential: "Credential issued",
      revokeCredential: "Credential revoked",
      revoke_credential: "Credential revoked",
      registerInstitution: "Institution registered",
      register_institution: "Institution registered",
    };

    const action = names[decoded.name];
    if (!action) {
      setCachedTransaction(sig, null);
      return null;
    }

    const args = decoded.data as {
      credentialHash?: ArrayLike<number>;
      credential_hash?: ArrayLike<number>;
    };
    const hashBytes = args.credentialHash || args.credential_hash;
    const credentialHash = hashBytes
      ? Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
      : undefined;

    const parsedActivity: InstitutionActivity = {
      signature: sig,
      blockTime: signatureInfo.blockTime ?? tx.blockTime ?? null,
      failed: Boolean(signatureInfo.err || tx.meta?.err),
      action,
      credentialHash,
    };

    setCachedTransaction(sig, parsedActivity);
    return parsedActivity;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Could not parse transaction ${sig}:`, err);
    }
    return null;
  }
}

/**
 * Fetches and resolves institution activity by combining cached transactions
 * with individual fetches for newly discovered signatures.
 */
async function fetchActivity(
  readConnection: web3.Connection,
  program: Program<Credibly>,
  signatures: Awaited<ReturnType<web3.Connection["getSignaturesForAddress"]>>,
  previousLatest: string | null
): Promise<ActivitySnapshot & { latestSignature: string | null }> {
  const records: InstitutionActivity[] = [];

  for (let i = 0; i < signatures.length; i++) {
    const sigInfo = signatures[i];
    const isCached = getCachedTransaction(sigInfo.signature) !== undefined;

    const activity = await parseTransaction(readConnection, program, sigInfo);
    if (activity) {
      records.push(activity);
    }

    // Delay only between uncached network calls to prevent RPC rate-limit spikes
    if (!isCached && i + 1 < signatures.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const latestSignature = signatures[0]?.signature ?? null;
  const snapshot = {
    activity: records,
    checkedAt: Date.now(),
    foundNewActivity: Boolean(previousLatest && latestSignature !== previousLatest),
    latestSignature,
  };
  return snapshot;
}

function runCachedRequest(
  key: string,
  load: () => Promise<ActivitySnapshot & { latestSignature: string | null }>
): Promise<ActivitySnapshot & { latestSignature: string | null }> {
  const active = pendingRequests.get(key);
  if (active) return active;

  const request = load()
    .then((snapshot) => {
      setCachedSnapshot(key, snapshot);
      return snapshot;
    })
    .finally(() => pendingRequests.delete(key));

  pendingRequests.set(key, request);
  return request;
}

/**
 * Fetches recent audit logs for an institution wallet.
 * Uses stale-while-revalidate: returns cached activity immediately if available,
 * and revalidates in the background if the cache is stale.
 */
export async function getInstitutionActivity(
  connection: web3.Connection,
  program: Program<Credibly>,
  issuer: web3.PublicKey,
  limit = MAX_ACTIVITY
): Promise<ActivitySnapshot> {
  const key = cacheKey(connection, program, issuer);
  const readConnection = getReadConnection(connection);
  const cached = getCachedSnapshot(key);

  // If cache is fresh, return immediately
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return { ...cached, activity: cached.activity.slice(0, limit), foundNewActivity: false };
  }

  // If stale cache exists, trigger background refresh but return stale immediately (SWR)
  if (cached) {
    void refreshInstitutionActivity(connection, program, issuer).catch(() => {});
    return { ...cached, activity: cached.activity.slice(0, limit), foundNewActivity: false };
  }

  // No cache at all: fetch with retry and fallback
  const snapshot = await runCachedRequest(key, async () => {
    const signatures = await withRetry(() =>
      readConnection.getSignaturesForAddress(issuer, { limit: Math.min(limit, MAX_ACTIVITY) })
    );
    return fetchActivity(readConnection, program, signatures, null);
  }).catch((error: unknown) => {
    const fallback = getCachedSnapshot(key);
    if (fallback) return fallback;
    throw error;
  });

  return { ...snapshot, activity: snapshot.activity.slice(0, limit) };
}

/**
 * Checks for newly submitted on-chain transactions without re-fetching already parsed transactions.
 */
export async function refreshInstitutionActivity(
  connection: web3.Connection,
  program: Program<Credibly>,
  issuer: web3.PublicKey
): Promise<ActivitySnapshot> {
  const key = cacheKey(connection, program, issuer);
  const readConnection = getReadConnection(connection);
  const cached = getCachedSnapshot(key);

  return runCachedRequest(key, async () => {
    // Check only the latest signature (1 lightweight call)
    const latest = await withRetry(() =>
      readConnection.getSignaturesForAddress(issuer, { limit: 1 })
    );
    const latestSignature = latest[0]?.signature ?? null;

    // If unchanged, refresh checkedAt without parsing anything
    if (cached && latestSignature === cached.latestSignature) {
      const refreshed = { ...cached, checkedAt: Date.now(), foundNewActivity: false };
      setCachedSnapshot(key, refreshed);
      return refreshed;
    }

    // If new signature found or no cache, get latest signatures
    const signatures = await withRetry(() =>
      readConnection.getSignaturesForAddress(issuer, { limit: MAX_ACTIVITY })
    );

    return fetchActivity(readConnection, program, signatures, cached?.latestSignature ?? null);
  });
}
