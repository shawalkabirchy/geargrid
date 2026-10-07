import { AppError } from "@geargrid/core";
import { idempotencyKeys } from "@geargrid/db";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate, requireScope, type Actor, type Scope } from "../auth/api-key";
import { database, type Tx } from "../db";
import { canonicalHash } from "./canonical";
import { apiError, errorResponse } from "./errors";

// The request pipeline every route handler runs (spec 6.1, 6.3): authenticate the key and check the scope; parse the
// path, query and body with the endpoint's schema; one READ COMMITTED transaction in which a real POST first claims its
// Idempotency-Key; the service; commit (writing the answer into the claimed row), or roll back for a dry run.

export interface Context<P, Q, B> {
  tx: Tx;
  actor: Actor;
  now: Date;
  params: P;
  query: Q;
  body: B;
  dryRun: boolean;
}

export interface Answer {
  status: number;
  body: Record<string, unknown>;
}

interface Options<P, Q, B> {
  method: "GET" | "POST" | "PATCH";
  /** The route pattern, part of the idempotency scope: "/api/v1/sales". */
  route: string;
  scope: Scope;
  params?: z.ZodType<P>;
  query?: z.ZodType<Q>;
  body?: z.ZodType<B>;
  /** ?dry_run=true runs the whole service and rolls back (spec 6.3). */
  dryRun?: boolean;
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** Rolls the transaction back and carries the answer out of it. */
class DryRunDone extends Error {
  constructor(readonly answer: Answer) {
    super("dry run");
  }
}

function parse<T>(schema: z.ZodType<T> | undefined, value: unknown): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw apiError("VALIDATION_FAILED", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw apiError("VALIDATION_FAILED", { issues: [{ path: "", message: "the body is not JSON" }] });
  }
}

export function endpoint<P = undefined, Q = undefined, B = undefined>(
  options: Options<P, Q, B>,
  handler: (context: Context<P, Q, B>) => Promise<Answer>,
): Handler {
  return async (request, context) => {
    const requestId = randomUUID();
    try {
      const actor = await authenticate(request);
      requireScope(actor, options.scope);
      const acting = request.headers.get("x-acting-user");
      if (acting !== null && (acting.trim().length < 1 || acting.trim().length > 100)) {
        throw apiError("VALIDATION_FAILED", {
          issues: [{ path: "X-Acting-User", message: "1 to 100 characters" }],
        });
      }
      const params = parse(options.params, await context.params);
      const searchParams = Object.fromEntries(new URL(request.url).searchParams);
      const dryRun = options.dryRun === true && searchParams.dry_run === "true";
      delete searchParams.dry_run;
      const query = parse(options.query, searchParams);
      const rawBody = options.method === "GET" ? undefined : await readJson(request);
      const body = parse(options.body, rawBody);

      const header = options.method === "POST" ? request.headers.get("idempotency-key") : null;
      if (header !== null && !KEY_PATTERN.test(header)) {
        throw apiError("VALIDATION_FAILED", {
          issues: [{ path: "Idempotency-Key", message: "8 to 100 characters of A-Z a-z 0-9 _ -" }],
        });
      }
      const key = dryRun ? null : header; // a dry run stores no key
      const scope = `${options.method} ${options.route}`;
      const requestHash = canonicalHash(rawBody);

      let outcome: { answer: Answer } | { replay: true };
      try {
        outcome = await database().transaction(
          async (tx) => {
            if (key) {
              // The claim is the first write. A concurrent duplicate waits here until the first transaction ends; a row
              // older than seven days counts as gone (spec 6.3).
              const claimed = await tx.execute(sql`
                insert into idempotency_keys (key, scope, request_hash) values (${key}, ${scope}, ${requestHash})
                on conflict (key, scope) do update
                  set request_hash = excluded.request_hash, response_status = null, response_body = null,
                      created_at = now()
                  where idempotency_keys.created_at < now() - interval '7 days'
                returning key`);
              if (claimed.rows.length === 0) return { replay: true as const };
            }
            const answer = await handler({ tx, actor, now: new Date(), params, query, body, dryRun });
            if (dryRun) throw new DryRunDone(answer);
            if (key) {
              await tx
                .update(idempotencyKeys)
                .set({ responseStatus: answer.status, responseBody: answer.body })
                .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)));
            }
            return { answer };
          },
          { isolationLevel: "read committed" },
        );
      } catch (error) {
        if (error instanceof DryRunDone) outcome = { answer: error.answer };
        else throw error;
      }

      if ("replay" in outcome) {
        const [stored] = await database()
          .select()
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.key, key!), eq(idempotencyKeys.scope, scope)));
        if (!stored || stored.responseStatus === null) throw new AppError("INTERNAL", 500, "errors.INTERNAL");
        if (stored.requestHash !== requestHash) throw apiError("IDEMPOTENCY_KEY_REUSED");
        return Response.json(stored.responseBody, {
          status: stored.responseStatus,
          headers: { "Idempotent-Replayed": "true", "X-Request-Id": requestId },
        });
      }
      return Response.json(outcome.answer.body, {
        status: outcome.answer.status,
        headers: { "X-Request-Id": requestId },
      });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}
