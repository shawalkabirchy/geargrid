import { users } from "@geargrid/db";
import { createServerClient } from "@supabase/ssr";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { database } from "../server/db";
import type { AuditActor } from "../server/posting";

// The web dashboard's login (GearGrid plan 3.4, 9; DokaanBondhu spec D193). The owner signs in with Supabase Auth;
// the session lives in cookies (@supabase/ssr) and the person is the active row of `users` with that auth user ID.
// Without SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY the pages say login is not set up, and the API is unaffected.
// In CI only (GEARGRID_ENV=ci, no Supabase), a test login stands in so the page tests can run: the seed owner's email
// and WEB_TEST_PASSWORD, kept in an HMAC-signed cookie. It never works anywhere else.

export type AuthMode = "supabase" | "test" | "none";

export interface WebUser {
  id: string;
  authUserId: string;
  name: string;
  role: string;
}

const TEST_COOKIE = "gg_test_session";

export function authMode(): AuthMode {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) return "supabase";
  if (process.env.GEARGRID_ENV === "ci" && (process.env.WEB_TEST_PASSWORD ?? "").length >= 12) return "test";
  return "none";
}

/** A Supabase client over this request's cookies. A server component cannot set cookies; the proxy refreshes them. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // rendering a server component: the proxy has already refreshed the session
        }
      },
    },
  });
}

async function activeUser(where: SQL): Promise<WebUser | null> {
  const [row] = await database()
    .select({ id: users.id, authUserId: users.authUserId, name: users.name, role: users.role })
    .from(users)
    .where(and(where, eq(users.status, "active"), sql`${users.deletedAt} is null`));
  return row ?? null;
}

function testSignature(authUserId: string): string {
  return createHmac("sha256", process.env.WEB_TEST_PASSWORD ?? "")
    .update(authUserId)
    .digest("hex");
}

function sameText(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export async function currentUser(): Promise<WebUser | null> {
  await connection(); // a page behind the login is never built ahead of time
  const mode = authMode();
  if (mode === "supabase") {
    const { data } = await (await supabaseServer()).auth.getClaims();
    const sub = data?.claims.sub;
    return typeof sub === "string" ? activeUser(eq(users.authUserId, sub)) : null;
  }
  if (mode === "test") {
    const value = (await cookies()).get(TEST_COOKIE)?.value ?? "";
    const [authUserId = "", signature = ""] = value.split(".");
    if (!authUserId || !sameText(signature, testSignature(authUserId))) return null;
    return activeUser(eq(users.authUserId, authUserId));
  }
  return null;
}

/** The logged-in person, or a redirect to the login page. */
export async function requireUser(): Promise<WebUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function signIn(email: string, password: string): Promise<boolean> {
  const mode = authMode();
  if (mode === "supabase") {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return false;
    if (await activeUser(eq(users.authUserId, data.user.id))) return true;
    await supabase.auth.signOut(); // a Supabase login with no active GearGrid user
    return false;
  }
  if (mode === "test") {
    const user = await activeUser(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    if (!user || !sameText(password, process.env.WEB_TEST_PASSWORD ?? "")) return false;
    (await cookies()).set(TEST_COOKIE, `${user.authUserId}.${testSignature(user.authUserId)}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return true;
  }
  return false;
}

export async function signOut(): Promise<void> {
  if (authMode() === "supabase") await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(TEST_COOKIE);
}

/** The audit's "who" for a change made on the web. */
export function webActor(user: WebUser): AuditActor {
  return { source: "web", userId: user.id, actingUser: user.name };
}
