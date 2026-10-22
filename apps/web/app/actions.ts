"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { database } from "../src/server/db";
import { setLanguage, settingsInput, updateSettings } from "../src/server/services/settings";
import { requireUser, signIn, signOut, webActor } from "../src/web/auth";
import { failedTry, goodTry, mayTry } from "../src/web/rate-limit";

// The web dashboard's form actions. Each one checks the login itself: an action is a public endpoint.

export interface FormState {
  status: "idle" | "ok" | "error";
  /** A label key, such as "login.failed". */
  message?: string;
  fields?: string[];
}

export async function loginAction(_previous: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const address = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${address}|${email.toLowerCase()}`;
  if (!mayTry(key)) return { status: "error", message: "login.too_many" };
  if (!email || !password || !(await signIn(email, password))) {
    failedTry(key);
    return { status: "error", message: "login.failed" };
  }
  goodTry(key);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

export async function languageAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const language = form.get("language") === "en" ? "en" : "bn";
  await database().transaction((tx) => setLanguage(tx, webActor(user), language));
  revalidatePath("/", "layout");
}

export async function settingsAction(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = settingsInput.safeParse({
    shopName: form.get("shopName") ?? "",
    marketArea: form.get("marketArea") ?? "",
    phone: form.get("phone") ?? "",
    address: form.get("address") ?? "",
    language: form.get("language"),
    banglaDigits: form.get("banglaDigits") === "on",
    roundOffRule: Number(form.get("roundOffRule")),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "settings.invalid",
      fields: parsed.error.issues.map((i) => String(i.path[0])),
    };
  }
  await database().transaction((tx) => updateSettings(tx, webActor(user), parsed.data));
  revalidatePath("/", "layout");
  return { status: "ok", message: "settings.saved" };
}
