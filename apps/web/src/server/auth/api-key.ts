import { apiKeys, type API_SCOPES } from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { database } from "../db";
import { apiError } from "../http/errors";
import { sha256Hex } from "../http/canonical";

// API-key authentication and scopes (spec 6.2). Clients send X-Api-Key: ggk_<32 base62>; only its SHA-256 is stored.
// Authorization: Bearer (the owner's login) arrives with slice C and answers 401 until then.

export type Scope = (typeof API_SCOPES)[number];

export interface Actor {
  apiKeyId: string;
  scopes: readonly string[];
  /** The audit source of the key: "ai" for DokaanBondhu's key. */
  source: "api" | "ai";
  /** X-Acting-User, when the client names the person (spec 6.3). */
  actingUser: string | null;
}

const API_KEY_PATTERN = /^ggk_[0-9A-Za-z]{32}$/;

export async function authenticate(request: Request): Promise<Actor> {
  const key = request.headers.get("x-api-key");
  if (!key || !API_KEY_PATTERN.test(key)) throw apiError("UNAUTHORIZED");
  const db = database();
  const [row] = await db
    .select({ id: apiKeys.id, scopes: apiKeys.scopes, source: apiKeys.auditSource })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(key)), isNull(apiKeys.revokedAt), isNull(apiKeys.deletedAt)));
  if (!row) throw apiError("UNAUTHORIZED");
  // last_used_at at most once a minute, so a busy key does not write on every request
  await db
    .update(apiKeys)
    .set({ lastUsedAt: sql`now()` })
    .where(
      and(
        eq(apiKeys.id, row.id),
        sql`(${apiKeys.lastUsedAt} is null or ${apiKeys.lastUsedAt} < now() - interval '1 minute')`,
      ),
    );
  return {
    apiKeyId: row.id,
    scopes: row.scopes,
    source: row.source === "ai" ? "ai" : "api",
    actingUser: request.headers.get("x-acting-user")?.trim() || null, // its length is checked by the pipeline
  };
}

export function requireScope(actor: Actor, scope: Scope): void {
  if (!actor.scopes.includes(scope)) throw apiError("FORBIDDEN_SCOPE", { required: scope });
}
