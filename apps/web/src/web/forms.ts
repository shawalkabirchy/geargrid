import { AppError } from "@geargrid/core";
import type { ZodError } from "zod";
import { database, type Tx } from "../server/db";
import bnErrors from "../server/http/messages/bn.json";
import enErrors from "../server/http/messages/en.json";
import { requireUser, webActor, type WebUser } from "./auth";
import { pageContext } from "./page-context";
import type { AuditActor } from "../server/posting";

// What the web dashboard's form actions share (DokaanBondhu spec D193): reading fields (Bangla digits and commas in
// numbers are fine), one transaction per change, and every refusal turned into a sentence in the shop's language: an
// API code in the API's own words, a web-only code from the labels, a form error listing the fields.

export interface WebState {
  status: "idle" | "ok" | "error";
  message?: string;
  /** Bumped on every success, so a form can clear itself. */
  done?: number;
}

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export const field = (form: FormData, name: string): string => String(form.get(name) ?? "").trim();
export const checked = (form: FormData, name: string): boolean => form.get(name) === "on";

/** Empty text as null. */
export const textOrNull = (form: FormData, name: string): string | null => field(form, name) || null;

/** A number as typed: Bangla digits become 0-9 and commas and spaces go. Empty is null; anything else NaN. */
export function numberOrNull(form: FormData, name: string): number | null {
  const value = field(form, name)
    .replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)))
    .replace(/[,\s]/g, "");
  return value === "" ? null : /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
}

/** The same, kept as text (a quantity such as "2.5"). */
export function decimalOrNull(form: FormData, name: string): string | null {
  const value = numberOrNull(form, name);
  return value === null ? null : Number.isNaN(value) ? "x" : String(value);
}

/** The logged-in owner; staff get the NOT_OWNER refusal (GearGrid plan 8.1: editing is the owner's). */
export async function requireOwner(): Promise<WebUser> {
  const user = await requireUser();
  if (user.role !== "owner") throw new AppError("NOT_OWNER", 403, "web.NOT_OWNER");
  return user;
}

function isZodError(error: unknown): error is ZodError {
  return typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues);
}

/** The sentence for a refusal, in the shop's language. */
export async function refusal(error: unknown): Promise<string> {
  const { t, language } = await pageContext();
  if (isZodError(error)) {
    const fields = [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")))]
      .map((name) => t(`fields.${name}`, { defaultValue: name }))
      .join(", ");
    return t("form.invalid", { fields });
  }
  if (error instanceof AppError) {
    if (error.messageKey.startsWith("web.")) return t(error.messageKey);
    const messages = (language === "en" ? enErrors : bnErrors).errors as Record<string, string>;
    if (messages[error.code]) return messages[error.code]!;
  }
  console.error(error);
  return ((language === "en" ? enErrors : bnErrors).errors as Record<string, string>).INTERNAL ?? "Error";
}

/**
 * Runs one change as the owner in one transaction and answers with the label `okKey`, or the refusal. `change` may
 * throw a ZodError from parsing; a redirect thrown inside it is passed on.
 */
export async function ownerChange(
  okKey: string,
  change: (tx: Tx, actor: AuditActor) => Promise<unknown>,
): Promise<WebState> {
  try {
    const user = await requireOwner();
    await database().transaction((tx) => change(tx, webActor(user)), { isolationLevel: "read committed" });
    const { t } = await pageContext();
    return { status: "ok", message: t(okKey), done: Date.now() };
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { status: "error", message: await refusal(error) };
  }
}

/** Next's redirect() works by throwing; it must not be shown as an error. */
export function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
